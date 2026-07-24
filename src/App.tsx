import { ArrowUpRight, CalendarDays, CheckCircle2, Dumbbell, Play, Route } from "lucide-react";

const START_DATE = new Date("2026-07-23T00:00:00+09:00");
const TOTAL_DAYS = 90;

type Workout = {
  day: string;
  date?: string;
  type: string;
  title: string;
  description: string;
  accent: "coral" | "yellow" | "blue" | "green";
  record?: string;
  exercises: {
    name: string;
    prescription: string;
    note: string;
  }[];
  link?: {
    label: string;
    url: string;
  };
};

const workouts: Workout[] = [
  {
    day: "THU",
    date: "7.23",
    type: "WEIGHT PUSH",
    title: "푸쉬업 맥스",
    description: "근력 운동처럼 세트마다 충분히 쉬고, 한 세트의 최대 반복을 밀어 올리는 날.",
    accent: "coral",
    record: "첫 기록 · 5세트 합계 83회",
    exercises: [
      {
        name: "푸쉬업 맥스 세트",
        prescription: "최대 5세트 · 세트 간 1분 30초",
        note: "각 세트 실패 직전까지. 자세가 무너지면 그 세트는 종료.",
      },
      {
        name: "이번 미션 총량",
        prescription: "100회",
        note: "성공하면 다음 푸쉬업 맥스 날 +10회, 실패하면 목표 유지.",
      },
    ],
  },
  {
    day: "FRI",
    type: "PUSH SKILL",
    title: "푸쉬업 기술",
    description: "다양한 푸쉬업을 빠르게 연결하며 자세와 움직임을 익히는 20분 기술 훈련.",
    accent: "yellow",
    exercises: [
      {
        name: "영상 가이드 루틴",
        prescription: "20분 · 1회 따라하기",
        note: "정우석 코치의 초보자 푸쉬업 루틴 순서를 그대로 진행.",
      },
      {
        name: "동작 전환",
        prescription: "동작 간 15초",
        note: "반복 수 경쟁보다 손 위치·몸통 정렬·가슴의 이동 범위를 우선.",
      },
      {
        name: "난이도 조절",
        prescription: "필요할 때 무릎 대고 계속",
        note: "동작 품질을 유지할 수 있는 형태로 즉시 낮춰 20분을 완주.",
      },
    ],
    link: {
      label: "초보자가 꼭 해야 할 푸쉬업 20분 루틴",
      url: "https://www.youtube.com/watch?v=Di-lTiYsQeE",
    },
  },
  {
    day: "SAT",
    type: "WEIGHT PULL",
    title: "풀업 미션 + 러닝",
    description: "토요일의 메인 등 운동. 보조 풀업을 웨이트 세트처럼 수행한 뒤 러닝머신으로 마무리.",
    accent: "blue",
    exercises: [
      {
        name: "보조 풀업 미션",
        prescription: "보조 35kg · 목표 총 30회",
        note: "최대 10세트. 세트 간 1분 30초.",
      },
      {
        name: "미션 판정",
        prescription: "총 30회 달성",
        note: "성공하면 다음 풀업 날 +10회, 실패하면 목표 유지.",
      },
      {
        name: "러닝머신",
        prescription: "20분",
        note: "걷기와 가벼운 달리기를 섞어 끝까지 유지 가능한 속도.",
      },
    ],
  },
  {
    day: "SUN",
    type: "MACHINE BACK",
    title: "머신 등 + 러닝",
    description: "토요일과 다른 자극. 실패 지점까지 가지 않고 머신으로 등 움직임을 반복 연습.",
    accent: "green",
    exercises: [
      {
        name: "랫풀다운",
        prescription: "3세트 × 10~12회",
        note: "가슴을 세우고 팔꿈치를 아래로 당기기. 2~3회 여유.",
      },
      {
        name: "시티드 로우",
        prescription: "3세트 × 10~12회",
        note: "몸통을 흔들지 않고 견갑을 뒤로 모으기. 2~3회 여유.",
      },
      {
        name: "리버스 펙덱 또는 페이스풀",
        prescription: "2세트 × 12~15회",
        note: "가벼운 무게로 어깨 뒤쪽과 등 상부에 집중.",
      },
      {
        name: "러닝머신",
        prescription: "20분",
        note: "회복을 방해하지 않는 편안한 강도로 마무리.",
      },
    ],
  },
];

function getJourneyDay() {
  const today = new Date();
  const elapsed = Math.floor((today.getTime() - START_DATE.getTime()) / 86_400_000) + 1;
  return Math.min(TOTAL_DAYS, Math.max(1, elapsed));
}

function App() {
  const journeyDay = getJourneyDay();

  return (
    <>
      <a className="skip-link" href="#routine">이번 주 루틴으로 건너뛰기</a>

      <header className="hero" id="top">
        <nav className="topbar" aria-label="주요 메뉴">
          <a className="brand" href="#top" aria-label="루크 90일 미션 홈">
            <span className="brand-mark"><Dumbbell size={18} aria-hidden="true" /></span>
            <span>LUKE / 90 DAYS</span>
          </a>
          <span className="top-date">2026.07.23 — 10.20</span>
        </nav>

        <div className="hero-main">
          <div>
            <p className="eyebrow">13-WEEK TRAINING JOURNEY</p>
            <h1>꾸준히<br /><span>90일.</span></h1>
            <p className="hero-copy">
              2026년 7월 23일 목요일에 시작한 90일 운동 미션.
              목·금은 푸쉬업, 토·일은 등 운동을 서로 다른 방식으로 반복합니다.
            </p>
          </div>

          <aside className="journey-card" aria-label="90일 미션 현황">
            <div className="journey-number">
              <span>DAY</span>
              <strong>{String(journeyDay).padStart(2, "0")}</strong>
              <small>/ 90</small>
            </div>
            <div className="journey-progress" aria-hidden="true">
              <span style={{ width: `${(journeyDay / TOTAL_DAYS) * 100}%` }} />
            </div>
            <div className="goal-pair">
              <div>
                <span>풀업 1세트</span>
                <strong>15회</strong>
              </div>
              <div>
                <span>푸쉬업 1세트</span>
                <strong>60회</strong>
              </div>
            </div>
            <p><CalendarDays size={15} aria-hidden="true" /> 13주 동안 같은 주간 구조를 반복</p>
          </aside>
        </div>
      </header>

      <main>
        <section className="start-record" aria-label="미션 시작 기록">
          <div className="record-icon"><CheckCircle2 aria-hidden="true" /></div>
          <div>
            <span>MISSION START · THU 07.23</span>
            <h2>첫 푸쉬업 기록, 83회</h2>
            <p>5세트 · 세트 간 1분 30초 · 합계 83회 완료</p>
          </div>
        </section>

        <section id="routine" className="routine-section" aria-labelledby="routine-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow dark">WEEKLY ROUTINE</p>
              <h2 id="routine-title">매주 목요일부터<br />일요일까지.</h2>
            </div>
            <p>월·화·수는 별도 미션 없이 회복합니다.</p>
          </div>

          <div className="workout-list">
            {workouts.map((workout, index) => (
              <article className={`workout-card ${workout.accent}`} key={workout.day}>
                <div className="workout-day">
                  <span>{workout.date ?? String(index + 1).padStart(2, "0")}</span>
                  <strong>{workout.day}</strong>
                </div>

                <div className="workout-body">
                  <p className="workout-type">{workout.type}</p>
                  <h3>{workout.title}</h3>
                  <p className="workout-description">{workout.description}</p>

                  {workout.record && (
                    <div className="record-chip"><CheckCircle2 size={17} aria-hidden="true" /> {workout.record}</div>
                  )}

                  <div className="exercise-table">
                    {workout.exercises.map((exercise) => (
                      <div className="exercise-item" key={exercise.name}>
                        <div><strong>{exercise.name}</strong><span>{exercise.note}</span></div>
                        <b>{exercise.prescription}</b>
                      </div>
                    ))}
                  </div>

                  {workout.link && (
                    <a className="video-link" href={workout.link.url} target="_blank" rel="noreferrer">
                      <span className="play-mark"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
                      <span><small>YOUTUBE GUIDE</small>{workout.link.label}</span>
                      <ArrowUpRight aria-hidden="true" />
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="finish-line" aria-labelledby="finish-title">
          <Route size={42} aria-hidden="true" />
          <div>
            <p className="eyebrow">FINISH LINE · 2026.10.20</p>
            <h2 id="finish-title">13주 뒤, 한 세트의 기준을 바꾼다.</h2>
          </div>
          <div className="finish-goals">
            <span>풀업 <strong>15</strong></span>
            <span>푸쉬업 <strong>60</strong></span>
          </div>
        </section>

        <section className="notes" aria-label="안전 및 출처">
          <p>
            예리한 통증·흉통·어지럼증이 있으면 즉시 중단합니다.
            이 루틴은 개인 운동 계획이며 의료 진단이나 치료를 대신하지 않습니다.
          </p>
          <div className="source-links">
            <a href="https://www.youtube.com/watch?v=Di-lTiYsQeE" target="_blank" rel="noreferrer">금요일 푸쉬업 영상</a>
            <a href="https://acsm.org/resistance-training-guidelines-update-2026/" target="_blank" rel="noreferrer">ACSM 저항운동 참고</a>
          </div>
        </section>
      </main>

      <footer>
        <p>LUKE / 90 DAYS</p>
        <p>2026.07.23 — 2026.10.20</p>
      </footer>
    </>
  );
}

export default App;
