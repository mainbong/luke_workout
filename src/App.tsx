import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronRight, Dumbbell, Play } from "lucide-react";

const START_DATE = new Date("2026-07-23T00:00:00+09:00");
const TOTAL_DAYS = 90;

const CURRENT_TARGETS = {
  pushTotal: 100,
  pullTotal: 30,
};

type Exercise = {
  name: string;
  prescription: string;
  note?: string;
};

type Routine = {
  id: string;
  day: string;
  ko: string;
  status: "pending" | "ready" | "done";
  short: string;
  title?: string;
  category?: string;
  summary?: string;
  target?: string;
  record?: string;
  exercises?: Exercise[];
  link?: { label: string; url: string };
};

const routines: Routine[] = [
  { id: "mon", day: "MON", ko: "월요일", status: "pending", short: "루틴 미정" },
  { id: "tue", day: "TUE", ko: "화요일", status: "pending", short: "루틴 미정" },
  { id: "wed", day: "WED", ko: "수요일", status: "pending", short: "루틴 미정" },
  {
    id: "thu",
    day: "THU",
    ko: "목요일",
    status: "done",
    short: `푸쉬업 ${CURRENT_TARGETS.pushTotal}`,
    category: "WEIGHT PUSH",
    title: "푸쉬업 맥스 미션",
    summary: "근력 운동처럼 세트마다 1분 30초를 쉬며 최대 반복을 수행합니다.",
    target: `현재 목표 · 5세트 합계 ${CURRENT_TARGETS.pushTotal}회`,
    record: "7월 23일 첫 기록 · 5세트 합계 83회",
    exercises: [
      {
        name: "푸쉬업",
        prescription: "최대 5세트",
        note: "각 세트 실패 직전까지. 자세가 무너지면 해당 세트 종료.",
      },
      {
        name: "세트 간 휴식",
        prescription: "1분 30초",
      },
    ],
  },
  {
    id: "fri",
    day: "FRI",
    ko: "금요일",
    status: "ready",
    short: "푸쉬업 기술",
    category: "PUSH SKILL",
    title: "푸쉬업 기술 루틴",
    summary: "영상의 다양한 푸쉬업 동작을 따라 하며 반복 수보다 기술을 익힙니다.",
    target: "현재 목표 · 영상 루틴 20분 완주",
    exercises: [
      {
        name: "영상 가이드 루틴",
        prescription: "20분 · 1회",
        note: "영상의 동작과 순서를 그대로 따라 하기.",
      },
      {
        name: "동작 간 휴식",
        prescription: "15초",
      },
    ],
    link: {
      label: "초보자가 꼭 해야 할 푸쉬업 20분 루틴",
      url: "https://www.youtube.com/watch?v=Di-lTiYsQeE",
    },
  },
  {
    id: "sat",
    day: "SAT",
    ko: "토요일",
    status: "ready",
    short: `풀업 ${CURRENT_TARGETS.pullTotal}`,
    category: "WEIGHT PULL",
    title: "풀업 미션 + 러닝머신",
    summary: "풀업을 웨이트 세트처럼 수행한 뒤 러닝머신을 진행합니다.",
    target: `현재 목표 · 풀업 총 ${CURRENT_TARGETS.pullTotal}회`,
    exercises: [
      {
        name: "풀업 미션",
        prescription: `총 ${CURRENT_TARGETS.pullTotal}회 · 최대 10세트`,
        note: "보조 중량 조건 없음.",
      },
      {
        name: "세트 간 휴식",
        prescription: "1분 30초",
      },
      {
        name: "러닝머신",
        prescription: "풀업 미션 후 진행",
      },
    ],
  },
  { id: "sun", day: "SUN", ko: "일요일", status: "pending", short: "루틴 미정" },
];

function getSeoulToday() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function getMonday(date: Date) {
  const monday = new Date(date);
  const day = date.getDay();
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getTodayRoutineId(date: Date) {
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getDay()];
}

function App() {
  const today = useMemo(getSeoulToday, []);
  const monday = useMemo(() => getMonday(today), [today]);
  const [selectedId, setSelectedId] = useState(() => getTodayRoutineId(today));
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const todayId = getTodayRoutineId(today);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const weekMapRef = useRef<HTMLDivElement>(null);
  const journeyDay = Math.min(
    TOTAL_DAYS,
    Math.max(1, Math.floor((today.getTime() - START_DATE.getTime()) / 86_400_000) + 1),
  );
  const week = Math.min(13, Math.max(1, Math.floor((journeyDay - 1) / 7) + 1));

  useLayoutEffect(() => {
    const container = weekMapRef.current;
    const button = selectedRef.current;
    if (!container || !button) return;
    container.scrollLeft = button.offsetLeft - (container.clientWidth - button.clientWidth) / 2;
  }, [selectedId]);

  return (
    <>
      <a className="skip-link" href="#weekly-map">주간 미니맵으로 건너뛰기</a>

      <header className="top-shell">
        <nav className="topbar" aria-label="페이지 정보">
          <a className="brand" href="#top" aria-label="루크 90일 미션 홈">
            <span className="brand-mark"><Dumbbell size={17} aria-hidden="true" /></span>
            <span>LUKE / 90 DAYS</span>
          </a>
          <span className="period">2026.07.23 — 10.20</span>
        </nav>

        <div className="compact-hero" id="top">
          <div>
            <p className="eyebrow">13-WEEK TRAINING JOURNEY</p>
            <h1>꾸준히 90일.</h1>
            <p>매주 같은 요일 루틴을 반복하고, 성과에 따라 목표 숫자만 갱신합니다.</p>
          </div>
          <div className="hero-stats" aria-label="미션 현황">
            <div><span>NOW</span><strong>DAY {String(journeyDay).padStart(2, "0")}</strong></div>
            <div><span>CYCLE</span><strong>WEEK {week} / 13</strong></div>
            <div><span>FINAL</span><strong>풀업 15 · 푸쉬업 60</strong></div>
          </div>
        </div>
      </header>

      <main>
        <section className="week-section" aria-labelledby="week-title">
          <div className="week-heading">
            <div>
              <p className="eyebrow dark">THIS WEEK</p>
              <h2 id="week-title">한 주 미니맵</h2>
            </div>
            <p>요일을 누르면 아래 운동이 바뀝니다.</p>
          </div>

          <div ref={weekMapRef} className="week-map" id="weekly-map" aria-label="월요일부터 일요일 운동 선택">
            {routines.map((routine, index) => {
              const date = new Date(monday);
              date.setDate(monday.getDate() + index);
              const isToday = routine.id === todayId;
              const isSelected = routine.id === selectedId;

              return (
                <button
                  ref={isSelected ? selectedRef : undefined}
                  className={`day-button ${routine.status} ${isSelected ? "selected" : ""}`}
                  key={routine.id}
                  onClick={() => setSelectedId(routine.id)}
                  aria-pressed={isSelected}
                  aria-label={`${routine.ko} ${date.getMonth() + 1}월 ${date.getDate()}일, ${routine.short}${isToday ? ", 오늘" : ""}`}
                  type="button"
                >
                  <span className="day-label">{routine.day}</span>
                  <strong>{date.getDate()}</strong>
                  <small>{routine.short}</small>
                  <span className="day-state">
                    {isToday ? "TODAY" : routine.status === "done" ? <><Check size={12} /> DONE</> : routine.status === "ready" ? "FIXED" : "WAITING"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="day-detail" aria-live="polite" aria-labelledby="selected-day-title">
          <div className="detail-day">
            <span>{selected.day}</span>
            <strong>{selected.ko}</strong>
          </div>

          {selected.status === "pending" ? (
            <div className="empty-routine">
              <p className="eyebrow dark">ROUTINE NOT SET</p>
              <h2 id="selected-day-title">{selected.ko} 루틴은 아직 없습니다.</h2>
              <p>직접 정한 운동을 전달받으면 이 자리에 추가합니다.</p>
            </div>
          ) : (
            <div className="detail-content">
              <p className="eyebrow dark">{selected.category}</p>
              <h2 id="selected-day-title">{selected.title}</h2>
              <p className="detail-summary">{selected.summary}</p>

              <div className="current-target">
                <span>CURRENT TARGET</span>
                <strong>{selected.target}</strong>
              </div>

              {selected.record && (
                <div className="record-line"><Check size={17} aria-hidden="true" /> {selected.record}</div>
              )}

              <div className="exercise-list">
                {selected.exercises?.map((exercise, index) => (
                  <article key={exercise.name}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><h3>{exercise.name}</h3>{exercise.note && <p>{exercise.note}</p>}</div>
                    <strong>{exercise.prescription}</strong>
                  </article>
                ))}
              </div>

              {selected.link && (
                <a className="video-link" href={selected.link.url} target="_blank" rel="noreferrer">
                  <span className="play"><Play size={17} fill="currentColor" aria-hidden="true" /></span>
                  <span><small>VIDEO GUIDE</small>{selected.link.label}</span>
                  <ArrowUpRight aria-hidden="true" />
                </a>
              )}
            </div>
          )}
        </section>

        <section className="goal-strip" aria-label="90일 최종 목표">
          <div><span>90-DAY GOAL</span><strong>풀업 1세트 15회</strong></div>
          <ChevronRight aria-hidden="true" />
          <div><span>90-DAY GOAL</span><strong>푸쉬업 1세트 60회</strong></div>
        </section>

        <p className="safety">
          예리한 통증·흉통·어지럼증이 있으면 즉시 중단합니다. 이 페이지는 직접 정한 운동 계획을 정리한 것이며 의료 진단이나 치료를 대신하지 않습니다.
        </p>
      </main>

      <footer><span>LUKE / 90 DAYS</span><span>THU 2026.07.23 — TUE 2026.10.20</span></footer>
    </>
  );
}

export default App;
