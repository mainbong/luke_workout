import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, Dumbbell, RotateCcw, TimerReset, X } from "lucide-react";
import { days } from "./data";

type Mission = "pull" | "push";
type MissionData = { reps: string[]; quality: boolean };
type WeekData = { completed: Record<string, boolean>; pull: MissionData; push: MissionData };
type AppState = {
  week: number;
  selectedDay: string;
  pullTarget: number;
  pushTarget: number;
  weeks: Record<string, WeekData>;
};

const STORAGE_KEY = "luke-workout-v2";
const defaultState: AppState = { week: 1, selectedDay: "mon", pullTarget: 24, pushTarget: 40, weeks: {} };

const makeWeek = (): WeekData => ({
  completed: {},
  pull: { reps: Array(6).fill(""), quality: false },
  push: { reps: Array(5).fill(""), quality: false },
});

function loadState(): AppState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    return { ...defaultState, ...saved, weeks: saved?.weeks ?? {} };
  } catch {
    return structuredClone(defaultState);
  }
}

function App() {
  const [state, setState] = useState<AppState>(loadState);
  const [seconds, setSeconds] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const currentWeek = state.weeks[String(state.week)] ?? makeWeek();
  const selectedDay = days.find((day) => day.id === state.selectedDay) ?? days[0];
  const completedCount = Object.values(currentWeek.completed).filter(Boolean).length;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const updateWeek = useCallback((updater: (week: WeekData) => WeekData) => {
    setState((previous) => {
      const key = String(previous.week);
      return { ...previous, weeks: { ...previous.weeks, [key]: updater(previous.weeks[key] ?? makeWeek()) } };
    });
  }, []);

  const startTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setSeconds(90);
    timerRef.current = window.setInterval(() => {
      setSeconds((value) => {
        if (value === null || value <= 1) {
          if (timerRef.current) window.clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setSeconds(null);
  };

  const selectDay = (id: string) => {
    setState((previous) => ({ ...previous, selectedDay: id }));
    requestAnimationFrame(() => document.querySelector("#today-detail")?.scrollIntoView({ behavior: "smooth" }));
  };

  const reset = () => {
    if (!window.confirm("4주 완료 기록과 세트별 횟수를 모두 지울까요? 이 작업은 되돌릴 수 없습니다.")) return;
    localStorage.removeItem(STORAGE_KEY);
    setState(structuredClone(defaultState));
  };

  return (
    <>
      <a className="skip-link" href="#calendar">주간 계획으로 건너뛰기</a>
      <header className="hero" id="top">
        <nav className="topbar" aria-label="주요 메뉴">
          <a className="brand" href="#top" aria-label="LUKE 운동 미션 홈">
            <span className="brand-mark" aria-hidden="true"><Dumbbell size={18} /></span>
            <span>LUKE / MISSION 01</span>
          </a>
          <div className="nav-links">
            <a href="#calendar">이번 주</a><a href="#missions">미션 규칙</a><a href="#month">4주 진행</a>
          </div>
        </nav>
        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">BEGINNER STRENGTH PROGRAM · 4 WEEKS</p>
            <h1>세게보다<br /><span>꾸준하게.</span></h1>
            <p className="hero-lead">수·토·일 헬스장의 목적을 나누고 집 운동과 회복을 연결한 1개월 반복 프로그램입니다.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#today-detail">오늘 루틴 보기</a>
              <button className="button button-quiet" onClick={startTimer} type="button"><TimerReset size={18} /> 90초 휴식</button>
            </div>
          </div>
          <aside className="mission-board" aria-label="이번 회차 요약">
            <div className="board-top">
              <div><p className="micro-label">CURRENT CYCLE</p><p className="cycle-title">WEEK {state.week} / 4</p></div>
              <label className="week-select-label">기록 주차
                <select value={state.week} onChange={(event) => setState((old) => ({ ...old, week: Number(event.target.value) }))}>
                  {[1, 2, 3, 4].map((week) => <option key={week} value={week}>{week}주차</option>)}
                </select>
              </label>
            </div>
            <div className="progress-track" aria-hidden="true"><span style={{ width: `${completedCount / 7 * 100}%` }} /></div>
            <p className="progress-copy"><strong>{completedCount} / 7 완료</strong><span>완료 체크는 이 기기에 저장됩니다.</span></p>
            <div className="target-row">
              <div><span>풀업 목표</span><strong>{state.pullTarget}회</strong></div>
              <div><span>푸쉬업 목표</span><strong>{state.pushTarget}회</strong></div>
            </div>
          </aside>
        </div>
      </header>

      <main>
        <section className="principles" aria-labelledby="principles-title">
          <div className="section-intro"><p className="eyebrow dark">THE PLAN</p><h2 id="principles-title">강한 날은 선명하게,<br />가벼운 날은 확실하게.</h2></div>
          <div className="principle-list">
            {[
              ["01", "품질 반복 우선", "모든 근력 동작은 폼이 무너지기 전, 보통 2회 여유(RIR 2)에서 멈춥니다."],
              ["02", "등 운동 강약 분리", "수요일은 주 운동, 토요일은 전신 볼륨, 일요일은 기술과 회복입니다."],
              ["03", "조금씩 증가", "한 번의 기록보다 두 번 연속 편안한 성공을 더 중요하게 봅니다."],
            ].map(([number, title, copy]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></article>)}
          </div>
        </section>

        <section id="calendar" className="calendar-section" aria-labelledby="calendar-title">
          <div className="section-heading-row"><div><p className="eyebrow dark">WEEKLY CALENDAR</p><h2 id="calendar-title">월요일부터 일요일까지</h2></div><p className="section-note">요일을 선택하면 아래에 상세 루틴이 열립니다.</p></div>
          <div className="calendar-grid" aria-label="요일별 운동 계획">
            {days.map((day) => (
              <button key={day.id} className={`day-card ${currentWeek.completed[day.id] ? "completed" : ""}`} data-level={day.level} aria-current={selectedDay.id === day.id} onClick={() => selectDay(day.id)}>
                <span className="day-top"><span>{day.short}</span>{currentWeek.completed[day.id] && <Check className="day-check" aria-label="완료" />}</span>
                <span><h3>{day.title}</h3><p>{day.summary}</p></span>
                <span className="day-tag">{day.tag}</span>
              </button>
            ))}
          </div>
        </section>

        <section id="today-detail" className="detail-section" aria-live="polite">
          <div className="detail-heading">
            <div><p className="eyebrow light">{selectedDay.short} / {selectedDay.tag}</p><h2>{selectedDay.ko} · {selectedDay.title}</h2><p>{selectedDay.summary}</p></div>
            <label className="complete-toggle">
              <input type="checkbox" checked={Boolean(currentWeek.completed[selectedDay.id])} onChange={(event) => updateWeek((week) => ({ ...week, completed: { ...week.completed, [selectedDay.id]: event.target.checked } }))} />
              <span aria-hidden="true" /> 오늘 운동 완료
            </label>
          </div>
          <div className="exercise-list">
            {selectedDay.exercises.map(([name, volume, rest, effort], index) => (
              <article className="exercise-row" key={name}>
                <span className="exercise-number">{String(index + 1).padStart(2, "0")}</span>
                <div className="exercise-name"><h3>{name}</h3></div>
                <div className="exercise-cell"><span>SETS × REPS</span><p>{volume}</p></div>
                <div className="exercise-cell"><span>REST</span><p>{rest}</p></div>
                <div className="exercise-cell"><span>STOP RULE</span><p>{effort}</p></div>
              </article>
            ))}
          </div>
          <div className="detail-footer"><p><strong>RIR</strong> = 몇 회 더 할 수 있는지 남은 횟수. RIR 2는 2회 여유입니다.</p><button className="text-button" onClick={startTimer}>90초 휴식 시작 <ChevronRight size={16} /></button></div>
        </section>

        <section id="missions" className="missions-section" aria-labelledby="missions-title">
          <div className="section-intro"><p className="eyebrow dark">PROGRESSION RULES</p><h2 id="missions-title">기록은 숫자로,<br />성공은 좋은 폼으로.</h2><p>기존 풀업 30회·푸쉬업 100회 목표를 현재 수행 수준에 맞춰 낮췄습니다. 다음 주에도 반복 가능한 성공을 만듭니다.</p></div>
          <div className="mission-cards">
            <MissionCard mission="pull" target={state.pullTarget} data={currentWeek.pull} onChange={(data) => updateWeek((week) => ({ ...week, pull: data }))} />
            <MissionCard mission="push" target={state.pushTarget} data={currentWeek.push} onChange={(data) => updateWeek((week) => ({ ...week, push: data }))} />
          </div>
        </section>

        <section id="month" className="month-section" aria-labelledby="month-title">
          <div className="section-heading-row"><div><p className="eyebrow light">THE FIRST MONTH</p><h2 id="month-title">4주를 한 사이클로</h2></div><p className="section-note light-note">매주 같은 틀, 컨디션에 맞는 작은 변화.</p></div>
          <ol className="month-grid">
            {[
              ["01", "기준 만들기", "무게를 늘리지 않고 동작 범위·편한 보조량·실제 반복을 기록합니다."],
              ["02", "품질 반복", "RIR와 자세가 유지될 때만 미션 목표를 올립니다."],
              ["03", "작게 전진", "상한 반복을 2회 연속 달성한 동작만 가장 작은 단위로 증량합니다."],
              ["04", "회복 확인", "피로가 쌓이면 각 동작 1세트씩 줄이고 다음 사이클을 준비합니다."],
            ].map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}
          </ol>
          <div className="reset-row"><p>기록은 브라우저 localStorage에만 저장되며 다른 기기와 동기화되지 않습니다. 브라우저 데이터를 지우면 함께 사라집니다.</p><button className="danger-button" onClick={reset}><RotateCcw size={16} /> 모든 기록 초기화</button></div>
        </section>

        <section className="safety-section" aria-labelledby="safety-title">
          <div className="safety-mark" aria-hidden="true"><CircleAlert /></div><div><h2 id="safety-title">몸이 보내는 신호가 우선입니다.</h2><p>예리하거나 갑작스러운 통증, 흉통, 심한 호흡곤란, 어지럼증이 생기면 즉시 중단하세요. 증상이 지속되거나 기존 질환·부상이 있다면 의료 전문가와 상의하세요. 이 프로그램은 일반 운동 정보이며 진단이나 치료를 대신하지 않습니다.</p></div>
        </section>

        <Sources />
      </main>

      {seconds !== null && <div className="timer" role="status" aria-live="polite"><div><span>REST TIMER</span><strong>{seconds === 0 ? "시작!" : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}</strong></div><button onClick={stopTimer} aria-label="휴식 타이머 닫기"><X size={17} /> 닫기</button></div>}
      <footer><p>LUKE / FOUR-WEEK MISSION</p><p>잘하는 것보다, 다시 할 수 있게.</p></footer>
    </>
  );
}

function MissionCard({ mission, target, data, onChange }: { mission: Mission; target: number; data: MissionData; onChange: (data: MissionData) => void }) {
  const config = mission === "pull"
    ? { label: "풀업", micro: "WEDNESDAY / ASSISTED", description: "보조 35kg에서 최대 6세트. 매 세트 RIR 2 또는 턱이 바를 넘지 못하기 직전에 종료하고 90초 쉽니다.", increment: 3, quality: "모든 반복에서 반동 없이 어깨를 안정적으로 유지함", details: "목표와 폼 기준을 모두 충족하면 다음 풀업 날 +3회, 실패하면 유지합니다. 36회에 도달해 2회 연속 성공한 뒤에만 보조를 2.5~5kg 줄이고 목표를 24회로 되돌립니다." }
    : { label: "푸쉬업", micro: "TUESDAY / HOME", description: "최대 5세트. 8~15회가 가능한 인클라인 또는 무릎 푸쉬업을 선택하고, 폼이 흐트러지기 2회 전에 멈춘 뒤 90초 쉽니다.", increment: 5, quality: "몸통이 일직선이고 가슴 높이와 손 위치를 끝까지 유지함", details: "목표와 폼 기준을 모두 충족하면 +5회, 실패하면 유지합니다. 8회 미만이면 인클라인을 높이고, 15회를 계속 넘으면 낮춥니다. 60회를 2회 연속 성공하면 한 단계 어려운 변형으로 바꾸고 40회부터 다시 시작합니다. 100회는 지금의 1차 목표로 사용하지 않습니다." };
  const total = useMemo(() => data.reps.reduce((sum, value) => sum + (Number(value) || 0), 0), [data.reps]);
  const hasRecord = data.reps.some((value) => value !== "");
  const success = hasRecord && total >= target && data.quality;
  const status = !hasRecord ? "기록 전" : success ? "성공" : data.quality ? "목표 미달" : "폼 확인 필요";
  const nextCopy = !hasRecord ? "다음 목표는 결과를 입력하면 계산됩니다." : success ? `성공! 다음 ${config.label} 날 목표는 ${target + config.increment}회입니다.` : `이번 목표는 유지합니다. 다음 ${config.label} 날도 ${target}회입니다.`;

  return (
    <article className={`mission-card ${mission}-card`}>
      <div className="mission-card-head"><div><p className="micro-label">{config.micro}</p><h3>{config.label} 미션</h3></div><div className="target-badge"><span>{target}</span><small>회 목표</small></div></div>
      <p>{config.description}</p>
      <div className="set-entry" aria-label={`${config.label} 세트별 실제 횟수`}>
        {data.reps.map((value, index) => <label className="rep-input" key={index}>{index + 1}세트<input type="number" min="0" max="99" inputMode="numeric" value={value} onChange={(event) => onChange({ ...data, reps: data.reps.map((rep, i) => i === index ? event.target.value : rep) })} aria-label={`${config.label} ${index + 1}세트 실제 횟수`} /></label>)}
      </div>
      <div className="mission-result"><span>합계 <strong>{total}</strong>회</span><span className={`status-pill ${hasRecord ? success ? "success" : "fail" : ""}`}>{status}</span></div>
      <label className="quality-check"><input type="checkbox" checked={data.quality} onChange={(event) => onChange({ ...data, quality: event.target.checked })} />{config.quality}</label>
      <p className="next-target">{nextCopy}</p>
      <details><summary>{mission === "pull" ? "증가 규칙" : "난이도·증가 규칙"}</summary><p>{config.details}</p></details>
    </article>
  );
}

function Sources() {
  const sources = [
    ["ACSM, 2026 저항운동 지침", "https://acsm.org/resistance-training-guidelines-update-2026/", "꾸준함, 전신 주 2회 이상, 점진적 증가, 실패 지점 훈련의 비필수성."],
    ["ACSM Position Stand 요약", "https://www.acsm.org/wp-content/uploads/2026/03/Resistance-Training-Position-Stand-infographic.pdf", "맨몸·기구·밴드 모두 효과적이며 목표와 일정에 맞춘 단순한 계획 권장."],
    ["미국 보건복지부 신체활동 지침", "https://odphp.health.gov/our-work/nutrition-physical-activity/physical-activity-guidelines/current-guidelines", "주요 근육군 강화 주 2일 이상, 적은 활동부터 시작해 점진적으로 증가."],
    ["CDC 성인 신체활동 안내", "https://www.cdc.gov/physical-activity-basics/adding-adults/index.html", "능력에 맞는 활동 선택, 활동 분산, 기존 질환이 있다면 전문가 상담."],
  ];
  return <section className="sources-section" aria-labelledby="sources-title"><div><p className="eyebrow dark">SOURCES</p><h2 id="sources-title">설계 근거</h2></div><ol>{sources.map(([label, url, copy]) => <li key={url}><a href={url} target="_blank" rel="noreferrer">{label}</a><span>{copy}</span></li>)}</ol></section>;
}

export default App;
