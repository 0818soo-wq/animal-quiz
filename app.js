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
const doneListeningBtn = document.getElementById("doneListeningBtn");
const replayHintBtn = document.getElementById("replayHintBtn");
const retryListenBtn = document.getElementById("retryListenBtn");
const nextBtn = document.getElementById("nextBtn");
const skipBtn = document.getElementById("skipBtn");
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
let currentAudioEl = null;
let currentAudioResolve = null;

function playAudio(src) {
  return new Promise((resolve) => {
    const audio = new Audio(src);
    currentAudioEl = audio;
    currentAudioResolve = resolve;
    const finish = () => {
      if (currentAudioEl === audio) {
        currentAudioEl = null;
        currentAudioResolve = null;
      }
      resolve();
    };
    audio.onended = finish;
    audio.onerror = finish;
    audio.play().catch(finish);
  });
}

// 건너뛰기 등으로 재생 중인 오디오를 즉시 멈추고, 기다리고 있던 await도 바로 풀어줌
function stopCurrentAudio() {
  if (currentAudioEl) {
    try { currentAudioEl.pause(); } catch (e) {}
  }
  if (currentAudioResolve) {
    const resolve = currentAudioResolve;
    currentAudioEl = null;
    currentAudioResolve = null;
    resolve();
  }
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
let quizToken = 0; // 건너뛰기 등으로 넘어가면 값이 바뀌어서, 이전 문제의 남은 처리를 무시하게 함

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
  quizToken++;
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
  doneListeningBtn.classList.add("hidden");
  replayHintBtn.classList.add("hidden");
  retryListenBtn.classList.add("hidden");
  nextBtn.classList.add("hidden");
}

async function playHintAudio(token, isFirst) {
  const animal = currentAnimal();
  if (isFirst) {
    statusText.textContent = "잘 듣고 저를 맞혀보세요!";
    await playAudio("audio/shared-intro.mp3");
    if (token !== quizToken) return;
    await playAudio(`audio/${animal.id}-hint1.mp3`);
    if (token !== quizToken) return;
    await playAudio(`audio/${animal.id}-hint2.mp3`);
  } else {
    statusText.textContent = "힌트를 하나 더 들려줄게요!";
    await playAudio("audio/shared-more-hint.mp3");
    if (token !== quizToken) return;
    await playAudio(`audio/${animal.id}-hint3.mp3`);
  }
}

async function playHintAndListen(isFirst) {
  const token = quizToken;
  playBtn.classList.add("hidden");
  doneListeningBtn.classList.add("hidden");
  replayHintBtn.classList.add("hidden");
  retryListenBtn.classList.add("hidden");
  feedbackText.textContent = "";
  await playHintAudio(token, isFirst);
  if (token !== quizToken) return;
  listenForAnswer();
}

async function replayHint() {
  const token = quizToken;
  if (manualCancelListening) manualCancelListening();
  replayHintBtn.classList.add("hidden");
  doneListeningBtn.classList.add("hidden");
  await playHintAudio(token, attemptStage === 0);
  if (token !== quizToken) return;
  listenForAnswer();
}

function skipToNext() {
  if (manualCancelListening) manualCancelListening();
  stopCurrentAudio();
  goNext();
}

const LISTEN_SAFETY_MAX_MS = 30000; // 완료 버튼을 안 눌러도 무한정 듣지는 않도록 하는 최후의 안전장치

let manualFinishListening = null;
let manualCancelListening = null;

// continuous:true는 크롬 버전/기기에 따라 결과를 아예 못 받아오는 등 불안정해서,
// 안정적으로 검증된 단발 인식(continuous:false)을 침묵으로 끊길 때마다 자동으로
// 새로 시작해서 이어 붙이는 방식으로 구현함 (완료 버튼을 누르기 전까지 계속 이어짐).
function listenForAnswer() {
  if (!speechSupported) return;

  const animal = currentAnimal();
  let matched = false;
  let finished = false;
  let fullTranscript = "";
  let safetyTimer = null;

  listeningIndicator.classList.remove("hidden");
  doneListeningBtn.classList.remove("hidden");
  replayHintBtn.classList.remove("hidden");
  retryListenBtn.classList.add("hidden");
  statusText.textContent = "이름을 말해보세요! 다 말했으면 '다 말했어요'를 눌러주세요.";

  function cleanup() {
    clearTimeout(safetyTimer);
    listeningIndicator.classList.add("hidden");
    doneListeningBtn.classList.add("hidden");
    replayHintBtn.classList.add("hidden");
    if (manualFinishListening === finalize) manualFinishListening = null;
    if (manualCancelListening === cancelListening) manualCancelListening = null;
  }

  function stopCurrentSession() {
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try { recognition.stop(); } catch (e) {}
      recognition = null;
    }
  }

  function cancelListening() {
    if (finished) return;
    finished = true;
    stopCurrentSession();
    cleanup();
  }

  function finalize() {
    if (finished || matched) return;
    finished = true;
    stopCurrentSession();
    cleanup();
    if (fullTranscript.trim()) {
      handleAnswer(fullTranscript);
    } else {
      statusText.textContent = "아직 아무 말도 안 들렸어요. 다시 말해줄래요?";
      retryListenBtn.classList.remove("hidden");
    }
  }

  manualFinishListening = finalize;
  manualCancelListening = cancelListening;
  safetyTimer = setTimeout(finalize, LISTEN_SAFETY_MAX_MS);

  function startSession() {
    if (finished || matched) return;
    recognition = new SpeechRecognitionCtor();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true; // 말하는 도중에도 계속 확인해서 정답이면 바로 끊기 위해
    recognition.maxAlternatives = 5;

    recognition.onresult = (event) => {
      let combined = "";
      for (let i = 0; i < event.results.length; i++) {
        for (let j = 0; j < event.results[i].length; j++) {
          combined += " " + event.results[i][j].transcript;
        }
      }
      // 이번 세션에서 들은 말을 이전까지 들은 것과 합쳐서, 끊겨도 여러 후보를 계속 판정
      fullTranscript = (fullTranscript + " " + combined).trim();

      if (!matched && isCorrectAnswer(fullTranscript, animal)) {
        matched = true;
        finished = true;
        stopCurrentSession();
        cleanup();
        handleAnswer(fullTranscript);
      }
    };

    recognition.onerror = (event) => {
      if (finished || matched) return;
      if (event.error === "no-speech") {
        startSession(); // 잠깐 조용했던 것뿐이니 완료 버튼 누르기 전까지 계속 듣기
        return;
      }
      if (event.error === "aborted") return;
      finished = true;
      cleanup();
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        statusText.textContent = "마이크 사용을 허락해주셔야 들을 수 있어요.";
      } else {
        statusText.textContent = "잘 못 들었어요. 다시 말해줄래요?";
      }
      retryListenBtn.classList.remove("hidden");
    };

    recognition.onend = () => {
      // 한 문장이 침묵으로 자연스럽게 끝난 것 -> 완료 버튼을 아직 안 눌렀으면 이어서 계속 듣기
      if (finished || matched) return;
      startSession();
    };

    try {
      recognition.start();
    } catch (e) {
      finished = true;
      cleanup();
      retryListenBtn.classList.remove("hidden");
    }
  }

  startSession();
}

async function handleAnswer(transcript) {
  const token = quizToken;
  const animal = currentAnimal();

  if (isCorrectAnswer(transcript, animal)) {
    animalEmoji.textContent = animal.emoji;
    feedbackText.textContent = `딩동댕~ 정답이에요! 정답은 ${animal.name}${wasParticle(animal.name)}!`;
    statusText.textContent = `정답: ${animal.name}`;
    await playAudio(`audio/${animal.id}-correct.mp3`);
    if (token !== quizToken) return;
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
    if (token !== quizToken) return;
    finishAnimal();
  }
}

function finishAnimal() {
  playBtn.classList.add("hidden");
  doneListeningBtn.classList.add("hidden");
  replayHintBtn.classList.add("hidden");
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

doneListeningBtn.addEventListener("click", () => {
  if (manualFinishListening) manualFinishListening();
});

replayHintBtn.addEventListener("click", () => {
  replayHint();
});

retryListenBtn.addEventListener("click", () => {
  retryListenBtn.classList.add("hidden");
  listenForAnswer();
});

nextBtn.addEventListener("click", goNext);

skipBtn.addEventListener("click", skipToNext);
