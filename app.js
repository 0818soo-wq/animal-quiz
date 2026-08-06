// ===== 동물퀴즈 앱 로직 =====

const frontScreen = document.getElementById("frontScreen");
const quizScreen = document.getElementById("quizScreen");
const doneScreen = document.getElementById("doneScreen");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const supportWarning = document.getElementById("supportWarning");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const animalEmoji = document.getElementById("animalEmoji");
const statusText = document.getElementById("statusText");
const feedbackText = document.getElementById("feedbackText");
const listeningIndicator = document.getElementById("listeningIndicator");

const playBtn = document.getElementById("playBtn");
const retryListenBtn = document.getElementById("retryListenBtn");
const nextBtn = document.getElementById("nextBtn");
const doneCount = document.getElementById("doneCount");

if (doneCount) doneCount.textContent = ANIMALS.length;

// ---------- 음성인식 지원 확인 ----------
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSupported = !!SpeechRecognitionCtor;
if (!speechSupported) {
  supportWarning.classList.remove("hidden");
  startBtn.disabled = true;
  startBtn.style.opacity = "0.5";
}

// ---------- 미리 만든 오디오(엣지 신경망 TTS) 재생 ----------
function playAudio(src) {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(() => resolve());
  });
}

function unlockAudio() {
  const a = new Audio("audio/shared-intro.mp3");
  a.volume = 0;
  a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => {});
}

// ---------- 답 정답 판정 ----------
const PARTICLES = ["이었어요", "이에요", "예요", "입니다", "이야", "이다", "랑", "은", "는", "이", "가", "을", "를", "요", "다", "야"];

function normalize(s) {
  return (s || "").replace(/\s+/g, "").trim().toLowerCase();
}

function stripParticles(s) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PARTICLES) {
      if (s.length > p.length && s.endsWith(p)) {
        s = s.slice(0, -p.length);
        changed = true;
        break;
      }
    }
  }
  return s;
}

function hasFinalConsonant(word) {
  if (!word) return false;
  const code = word.charCodeAt(word.length - 1) - 0xAC00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}

function wasParticle(word) {
  return hasFinalConsonant(word) ? "이었어요" : "였어요";
}

function isCorrectAnswer(transcript, animal) {
  const t = normalize(transcript);
  const tStripped = stripParticles(t);
  const candidates = [animal.name, ...(animal.aliases || [])].map(normalize);
  for (const c of candidates) {
    if (!c) continue;
    if (c.length <= 2) {
      if (t === c || tStripped === c) return true;
    } else {
      if (t.includes(c) || tStripped.includes(c)) return true;
    }
  }
  return false;
}

// ---------- 퀴즈 상태 ----------
let quizOrder = [];
let currentIndex = 0;
let attemptStage = 0; // 0: 첫 힌트, 1: 두 번째 힌트
let recognizing = false;
let recognition = null;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function showScreen(el) {
  [frontScreen, quizScreen, doneScreen].forEach(s => s.classList.add("hidden"));
  el.classList.remove("hidden");
}

function startQuiz() {
  quizOrder = shuffle(ANIMALS.map((_, i) => i));
  currentIndex = 0;
  showScreen(quizScreen);
  loadCurrentAnimal();
}

function currentAnimal() {
  return ANIMALS[quizOrder[currentIndex]];
}

function loadCurrentAnimal() {
  attemptStage = 0;
  const animal = currentAnimal();
  progressText.textContent = `${currentIndex + 1} / ${quizOrder.length}`;
  progressFill.style.width = `${((currentIndex) / quizOrder.length) * 100}%`;
  animalEmoji.textContent = "❓";
  statusText.textContent = "버튼을 눌러서 힌트를 들어보세요!";
  feedbackText.textContent = "";
  listeningIndicator.classList.add("hidden");
  playBtn.classList.remove("hidden");
  playBtn.disabled = false;
  retryListenBtn.classList.add("hidden");
  nextBtn.classList.add("hidden");
}

async function playHintAndListen(isFirst) {
  playBtn.classList.add("hidden");
  retryListenBtn.classList.add("hidden");
  feedbackText.textContent = "";
  const animal = currentAnimal();

  if (isFirst) {
    statusText.textContent = "잘 듣고 저를 맞혀보세요!";
    await playAudio("audio/shared-intro.mp3");
    await playAudio(`audio/${animal.id}-hint1.mp3`);
    await playAudio(`audio/${animal.id}-hint2.mp3`);
  } else {
    statusText.textContent = "힌트를 하나 더 들려줄게요!";
    await playAudio("audio/shared-more-hint.mp3");
    await playAudio(`audio/${animal.id}-hint3.mp3`);
  }
  listenForAnswer();
}

function listenForAnswer() {
  if (!speechSupported) return;
  recognition = new SpeechRecognitionCtor();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.maxAlternatives = 3;

  listeningIndicator.classList.remove("hidden");
  statusText.textContent = "이름을 말해보세요!";

  recognition.onresult = (event) => {
    listeningIndicator.classList.add("hidden");
    let transcript = "";
    for (let i = 0; i < event.results[0].length; i++) {
      transcript += " " + event.results[0][i].transcript;
    }
    handleAnswer(transcript);
  };

  recognition.onerror = (event) => {
    listeningIndicator.classList.add("hidden");
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      statusText.textContent = "마이크 사용을 허락해주셔야 들을 수 있어요.";
    } else {
      statusText.textContent = "잘 못 들었어요. 다시 말해줄래요?";
    }
    retryListenBtn.classList.remove("hidden");
  };

  recognition.onend = () => {
    listeningIndicator.classList.add("hidden");
  };

  try {
    recognition.start();
  } catch (e) {
    retryListenBtn.classList.remove("hidden");
  }
}

async function handleAnswer(transcript) {
  const animal = currentAnimal();

  if (isCorrectAnswer(transcript, animal)) {
    animalEmoji.textContent = animal.emoji;
    feedbackText.textContent = "딩동댕~ 정답이에요!";
    statusText.textContent = `정답: ${animal.name}`;
    await playAudio("audio/shared-correct.mp3");
    finishAnimal();
    return;
  }

  if (attemptStage === 0) {
    attemptStage = 1;
    feedbackText.textContent = "땡! 아쉬워요~";
    await playHintAndListen(false);
  } else {
    animalEmoji.textContent = animal.emoji;
    const wasWord = wasParticle(animal.name);
    feedbackText.textContent = `정답은 ${animal.name}${wasWord}!`;
    statusText.textContent = `정답: ${animal.name}`;
    await playAudio(`audio/${animal.id}-reveal.mp3`);
    finishAnimal();
  }
}

function finishAnimal() {
  playBtn.classList.add("hidden");
  retryListenBtn.classList.add("hidden");
  nextBtn.classList.remove("hidden");
  progressFill.style.width = `${((currentIndex + 1) / quizOrder.length) * 100}%`;
}

function goNext() {
  currentIndex++;
  if (currentIndex >= quizOrder.length) {
    showScreen(doneScreen);
  } else {
    loadCurrentAnimal();
  }
}

// ---------- 이벤트 연결 ----------
startBtn.addEventListener("click", () => {
  unlockAudio();
  startQuiz();
});

restartBtn.addEventListener("click", () => {
  showScreen(frontScreen);
});

playBtn.addEventListener("click", () => {
  playHintAndListen(true);
});

retryListenBtn.addEventListener("click", () => {
  retryListenBtn.classList.add("hidden");
  listenForAnswer();
});

nextBtn.addEventListener("click", goNext);
