import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowUpRight, Check, Dumbbell, LogIn, LogOut, Play, Save } from "lucide-react";
import {
  isSupabaseConfigured,
  supabase,
  type RoutineCompletion,
  type WorkoutSession,
} from "./supabase";

const START_DATE = new Date("2026-07-23T00:00:00+09:00");
const END_DATE = "2026-10-20";
const TOTAL_DAYS = 90;
const PUSH_START_TARGET = 100;
const PULL_START_TARGET = 30;

type Exercise = {
  name: string;
  prescription: string;
  note?: string;
  guides?: { label: string; url: string }[];
};

type Routine = {
  id: string;
  day: string;
  ko: string;
  status: "pending" | "ready";
  short: string;
  title?: string;
  category?: string;
  summary?: string;
  target?: string;
  record?: string;
  exercises?: Exercise[];
  link?: { label: string; url: string };
};

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

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getThisWeeksThursday(today: Date) {
  const monday = getMonday(today);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  return toDateInputValue(thursday < START_DATE ? START_DATE : thursday);
}

function getThisWeeksSaturday(today: Date) {
  const monday = getMonday(today);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 5);
  return toDateInputValue(saturday);
}

function formatWorkoutDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function nextPushTarget(records: WorkoutSession[]) {
  if (records.length === 0) return PUSH_START_TARGET;
  const latest = records[0];
  return latest.total_reps >= latest.target_total
    ? latest.target_total + 10
    : latest.target_total;
}

function nextPullTarget(records: WorkoutSession[]) {
  if (records.length === 0) return PULL_START_TARGET;
  const latest = records[0];
  return latest.total_reps >= latest.target_total && latest.set_count !== null && latest.set_count <= 10
    ? latest.target_total + 10
    : latest.target_total;
}

function buildRoutines(
  pushTarget: number,
  pullTarget: number,
  week: number,
  latestPushRecord?: WorkoutSession,
  latestPullRecord?: WorkoutSession,
): Routine[] {
  return [
    { id: "mon", day: "MON", ko: "월요일", status: "pending", short: "루틴 미정" },
    { id: "tue", day: "TUE", ko: "화요일", status: "pending", short: "루틴 미정" },
    { id: "wed", day: "WED", ko: "수요일", status: "pending", short: "루틴 미정" },
    {
      id: "thu",
      day: "THU",
      ko: "목요일",
      status: "ready",
      short: `푸쉬업 ${pushTarget}`,
      category: "WEIGHT PUSH",
      title: "푸쉬업 맥스 미션",
      summary: "근력 운동처럼 세트마다 1분 30초를 쉬며 최대 반복을 수행합니다.",
      target: `현재 목표 · 5세트 합계 ${pushTarget}회`,
      record: latestPushRecord
        ? `${formatWorkoutDate(latestPushRecord.workout_date)} 최근 기록 · ${latestPushRecord.total_reps} / ${latestPushRecord.target_total}회`
        : undefined,
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
      short: `풀업 ${pullTarget}`,
      category: "WEIGHT PULL",
      title: "풀업 미션 + 러닝머신",
      summary: "풀업을 웨이트 세트처럼 수행한 뒤 러닝머신을 진행합니다.",
      target: `현재 목표 · 풀업 총 ${pullTarget}회`,
      record: latestPullRecord
        ? `${formatWorkoutDate(latestPullRecord.workout_date)} 최근 기록 · ${latestPullRecord.total_reps} / ${latestPullRecord.target_total}회 · ${latestPullRecord.set_count}세트`
        : undefined,
      exercises: [
        {
          name: "풀업 미션",
          prescription: `총 ${pullTarget}회 · 완료할 때까지`,
          note: "완료에 든 세트 수를 기록. 10세트 안에 완료하면 다음 주 목표 +10회. 보조 중량 조건 없음.",
        },
        {
          name: "세트 간 휴식",
          prescription: "1분 30초",
        },
        {
          name: "러닝머신",
          prescription: week === 1 ? "속도 10 이상 · 10분" : "속도 10 이상 · 시간은 추후 지정",
          note: "풀업 미션을 마친 뒤 진행.",
        },
      ],
    },
    {
      id: "sun",
      day: "SUN",
      ko: "일요일",
      status: "ready",
      short: "등 볼륨 + 러닝",
      category: "BACK VOLUME",
      title: "등 볼륨 루틴 + 러닝머신",
      summary: "반복 수와 자세를 우선하며, 정한 규칙에 따라 보조·증량·감량을 적용합니다.",
      target: "오늘 목표 · 등 운동 4종 + 러닝머신 10분",
      exercises: [
        {
          name: "풀업",
          prescription: "3회 × 5세트",
          note: "맨몸으로 시작. 3회를 채우지 못하는 순간 풀업머신으로 전환해 해당 세트의 3회를 채웁니다. 예: 2개째에서 실패하면 보조중량을 최소로 놓고 2개 추가.",
          guides: [
            {
              label: "보조 풀업머신 셋업·안전",
              url: "https://www.youtube.com/watch?v=fnHeovkmkkk",
            },
          ],
        },
        {
          name: "시티드 케이블 로우",
          prescription: "15회 × 5세트",
          note: "15회를 당겨 RPE 8인 시작 무게를 정합니다. 매 세트 한 칸씩 증량하며 15회를 채우고, 실패하면 증량을 멈춘 뒤 남은 세트는 같은 무게로 가능한 최대 횟수까지 진행합니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 1분 자세",
              url: "https://www.youtube.com/shorts/YeQDG8uUE3M",
            },
            {
              label: "한국어 상세 가이드 · 2분대",
              url: "https://www.youtube.com/watch?v=guLhRDd8VTA",
            },
          ],
        },
        {
          name: "스트레이트 암 풀다운",
          prescription: "15회 × 5세트",
          note: "첫 15회가 RPE 8인 무게를 찾고 같은 무게로 5세트를 진행합니다. 15회에 실패하면 자세를 유지할 수 있도록 계속 감량하면서 15회를 채웁니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 자극 잡기",
              url: "https://www.youtube.com/shorts/0sUwxJgXBdQ",
            },
            {
              label: "상세 셋업·자세",
              url: "https://www.youtube.com/watch?v=98W63pVdW38",
            },
          ],
        },
        {
          name: "케이블 페이스풀",
          prescription: "15회 × 5세트",
          note: "셋업과 자세를 미리 충분히 숙지합니다. 첫 15회가 RPE 8인 무게로 시작하고, 이후 15회에 실패하면 감량하면서 매 세트 15회를 채웁니다.",
          guides: [
            {
              label: "페이스풀 실수 10가지와 교정",
              url: "https://www.youtube.com/watch?v=cc0tasCalHg",
            },
          ],
        },
        {
          name: "러닝머신",
          prescription: "속도 10 이상 · 10분",
          note: "등 운동을 모두 마친 뒤 진행합니다.",
          guides: [
            {
              label: "Life Fitness 러닝머신 조작 예시",
              url: "https://www.youtube.com/watch?v=usScM1QZrQw",
            },
            {
              label: "기본 러닝 자세",
              url: "https://www.youtube.com/watch?v=_kGESn8ArrU",
            },
          ],
        },
      ],
    },
  ];
}

function WorkoutResultForm({
  workoutType,
  session,
  records,
  currentTarget,
  defaultDate,
  initialMessage,
  onSaved,
}: {
  workoutType: "pushup" | "pullup";
  session: Session | null;
  records: WorkoutSession[];
  currentTarget: number;
  defaultDate: string;
  initialMessage?: string;
  onSaved: () => Promise<void>;
}) {
  const isPullup = workoutType === "pullup";
  const [email, setEmail] = useState("");
  const [workoutDate, setWorkoutDate] = useState(defaultDate);
  const [totalReps, setTotalReps] = useState("");
  const [setCount, setSetCount] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);
  const savedRecord = records.find((record) => record.workout_date === workoutDate);

  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    if (savedRecord) {
      setTotalReps(String(savedRecord.total_reps));
      setSetCount(savedRecord.set_count === null ? "" : String(savedRecord.set_count));
    } else {
      setTotalReps("");
      setSetCount("");
    }
  }, [isPullup, savedRecord, workoutDate]);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    setBusy(false);
    setMessage(
      error
        ? error.message
        : "새 로그인 링크를 보냈습니다. 가장 최근 메일의 링크를 한 번만 열어주세요.",
    );
  }

  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const sets = isPullup ? Number(setCount) : null;
    if (isPullup && (!Number.isInteger(sets) || sets === null || sets < 1)) {
      setMessage("풀업 완료 세트 수는 1 이상의 정수로 입력해주세요.");
      return;
    }
    const workoutDay = new Date(`${workoutDate}T00:00:00+09:00`).getDay();
    const expectedDay = isPullup ? 6 : 4;
    if (workoutDay !== expectedDay) {
      setMessage(`${isPullup ? "풀업" : "푸쉬업"} 기록은 ${isPullup ? "토요일" : "목요일"} 날짜로 입력해주세요.`);
      return;
    }

    const existing = records.find((record) => record.workout_date === workoutDate);
    const target = existing?.target_total ?? currentTarget;
    const reps = isPullup ? target : Number(totalReps);
    if (!Number.isInteger(reps) || reps < 0) {
      setMessage("합계는 0 이상의 정수로 입력해주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("workout_sessions").upsert(
      {
        user_id: session.user.id,
        workout_date: workoutDate,
        workout_type: workoutType,
        target_total: target,
        total_reps: reps,
        set_count: sets,
      },
      { onConflict: "user_id,workout_date,workout_type" },
    );

    if (error) {
      setMessage(`저장하지 못했습니다: ${error.message}`);
    } else {
      await onSaved();
      const succeeded = isPullup
        ? sets !== null && sets <= 10
        : reps >= target;
      const followingTarget = succeeded ? target + 10 : target;
      setMessage(`저장 완료 · 다음 목표 ${followingTarget}회`);
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("로그아웃했습니다.");
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="result-panel" aria-labelledby="result-title">
        <div>
          <p className="eyebrow dark">RESULT LOG</p>
          <h3 id="result-title">결과 저장 준비 중</h3>
        </div>
        <p className="form-message">Supabase 배포 설정이 완료되면 이곳에서 기록할 수 있습니다.</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="result-panel" aria-labelledby="result-title">
        <div>
          <p className="eyebrow dark">RESULT LOG</p>
          <h3 id="result-title">이메일로 기록 시작</h3>
          <p>가장 최근에 받은 링크를 한 번만 열어주세요. 기록은 해당 계정에만 보입니다.</p>
        </div>
        <form className="login-form" onSubmit={sendMagicLink}>
          <label htmlFor={`${workoutType}-login-email`}>이메일</label>
          <div>
            <input
              id={`${workoutType}-login-email`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="luke@example.com"
              required
            />
            <button type="submit" disabled={busy}>
              <LogIn size={16} aria-hidden="true" />
              {busy ? "전송 중" : initialMessage ? "새 링크 받기" : "로그인 링크 받기"}
            </button>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="result-panel" aria-labelledby="result-title">
      <div className="result-heading">
        <div>
          <p className="eyebrow dark">RESULT LOG</p>
          <h3 id="result-title">{isPullup ? "토요일 풀업 결과 입력" : "목요일 푸쉬업 결과 입력"}</h3>
          <p>
            {isPullup
              ? "목표 횟수를 완료하는 데 사용한 세트 수를 적으면 다음 목표를 자동 계산합니다."
              : "5세트의 합계만 적으면 다음 목표를 자동 계산합니다."}
          </p>
        </div>
        <button className="text-button" type="button" onClick={signOut}>
          <LogOut size={14} aria-hidden="true" /> 로그아웃
        </button>
      </div>
      <form className={`result-form ${isPullup ? "pullup" : ""}`} onSubmit={saveResult}>
        <label>
          운동 날짜
          <input
            type="date"
            min="2026-07-23"
            max={END_DATE}
            value={workoutDate}
            onChange={(event) => setWorkoutDate(event.target.value)}
            required
          />
        </label>
        {!isPullup && (
          <label>
            5세트 합계
            <span className="number-input">
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={totalReps}
                onChange={(event) => setTotalReps(event.target.value)}
                required
              />
              <span>회</span>
            </span>
          </label>
        )}
        {isPullup && (
          <label>
            완료 세트 수
            <span className="number-input">
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={setCount}
                onChange={(event) => setSetCount(event.target.value)}
                required
              />
              <span>세트</span>
            </span>
          </label>
        )}
        <button className="save-button" type="submit" disabled={busy}>
          <Save size={17} aria-hidden="true" />
          {busy ? "저장 중" : savedRecord ? "기록 수정" : "결과 저장"}
        </button>
      </form>
      <p className="rule-preview">
        이번 목표 <strong>{savedRecord?.target_total ?? currentTarget}회</strong>
        <span aria-hidden="true">→</span>
        {isPullup ? (
          <>10세트 이내 <strong>+10</strong> · 11세트 이상 <strong>유지</strong></>
        ) : (
          <>성공 <strong>+10</strong> · 실패 <strong>유지</strong></>
        )}
      </p>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

function RoutineCompletionPanel({
  routine,
  workoutDate,
  session,
  completed,
  onChanged,
}: {
  routine: Routine;
  workoutDate: string;
  session: Session | null;
  completed: boolean;
  onChanged: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}` },
    });
    setBusy(false);
    setMessage(
      error
        ? error.message
        : "로그인 링크를 보냈습니다. 가장 최근 메일의 링크를 한 번만 열어주세요.",
    );
  }

  async function toggleCompletion() {
    if (!supabase || !session) return;
    setBusy(true);
    setMessage("");

    const query = completed
      ? supabase
          .from("routine_completions")
          .delete()
          .eq("workout_date", workoutDate)
          .eq("routine_id", routine.id)
      : supabase.from("routine_completions").upsert(
          {
            user_id: session.user.id,
            workout_date: workoutDate,
            routine_id: routine.id,
          },
          { onConflict: "user_id,workout_date,routine_id" },
        );
    const { error } = await query;

    if (error) {
      setMessage(`완료 상태를 저장하지 못했습니다: ${error.message}`);
    } else {
      await onChanged();
      setMessage(completed ? "완료 체크를 취소했습니다." : "운동 완료를 기록했습니다.");
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="result-panel completion-panel" aria-labelledby="completion-title">
        <div>
          <p className="eyebrow dark">COMPLETION LOG</p>
          <h3 id="completion-title">완료 기록 준비 중</h3>
        </div>
        <p className="form-message">Supabase 배포 설정이 완료되면 이곳에서 완료 체크할 수 있습니다.</p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="result-panel completion-panel" aria-labelledby="completion-title">
        <div>
          <p className="eyebrow dark">COMPLETION LOG</p>
          <h3 id="completion-title">로그인하고 완료 체크</h3>
          <p>완료 상태는 로그인한 계정에 저장됩니다.</p>
        </div>
        <form className="login-form" onSubmit={sendMagicLink}>
          <label htmlFor={`${routine.id}-completion-email`}>이메일</label>
          <div>
            <input
              id={`${routine.id}-completion-email`}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="luke@example.com"
              required
            />
            <button type="submit" disabled={busy}>
              <LogIn size={16} aria-hidden="true" />
              {busy ? "전송 중" : "로그인 링크 받기"}
            </button>
          </div>
          {message && <p className="form-message" role="status">{message}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="result-panel completion-panel" aria-labelledby="completion-title">
      <div className="result-heading">
        <div>
          <p className="eyebrow dark">COMPLETION LOG</p>
          <h3 id="completion-title">{formatWorkoutDate(workoutDate)} 운동 완료</h3>
          <p>운동을 마친 뒤 체크하면 주간 미니맵에도 DONE으로 표시됩니다.</p>
        </div>
        <button className="text-button" type="button" onClick={signOut}>
          <LogOut size={14} aria-hidden="true" /> 로그아웃
        </button>
      </div>
      <label className={`completion-check ${completed ? "checked" : ""}`}>
        <input
          type="checkbox"
          checked={completed}
          disabled={busy}
          onChange={() => void toggleCompletion()}
        />
        <span className="completion-checkmark" aria-hidden="true">
          {completed && <Check size={18} strokeWidth={3} />}
        </span>
        <span>
          <strong>{busy ? "저장 중" : completed ? "운동 완료됨" : "운동을 완료했어요"}</strong>
          <small>{completed ? "체크를 해제하면 완료 기록이 취소됩니다." : "체크하면 이 날짜의 완료 상태가 저장됩니다."}</small>
        </span>
      </label>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

function App() {
  const today = useMemo(getSeoulToday, []);
  const monday = useMemo(() => getMonday(today), [today]);
  const [selectedId, setSelectedId] = useState(() => getTodayRoutineId(today));
  const [session, setSession] = useState<Session | null>(null);
  const [authNotice, setAuthNotice] = useState("");
  const [pushRecords, setPushRecords] = useState<WorkoutSession[]>([]);
  const [pullRecords, setPullRecords] = useState<WorkoutSession[]>([]);
  const [completionRecords, setCompletionRecords] = useState<RoutineCompletion[]>([]);
  const todayId = getTodayRoutineId(today);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const weekMapRef = useRef<HTMLDivElement>(null);
  const journeyDay = Math.min(
    TOTAL_DAYS,
    Math.max(1, Math.floor((today.getTime() - START_DATE.getTime()) / 86_400_000) + 1),
  );
  const week = Math.min(13, Math.max(1, Math.floor((journeyDay - 1) / 7) + 1));
  const pushTarget = nextPushTarget(pushRecords);
  const pullTarget = nextPullTarget(pullRecords);
  const routines = useMemo(
    () => buildRoutines(pushTarget, pullTarget, week, pushRecords[0], pullRecords[0]),
    [pullRecords, pullTarget, pushRecords, pushTarget, week],
  );
  const selected = routines.find((routine) => routine.id === selectedId) ?? routines[0];
  const selectedIndex = routines.findIndex((routine) => routine.id === selected.id);
  const selectedDate = new Date(monday);
  selectedDate.setDate(monday.getDate() + selectedIndex);
  const selectedWorkoutDate = toDateInputValue(selectedDate);

  function isRoutineCompleted(routine: Routine, workoutDate: string) {
    if (routine.id === "thu") {
      return pushRecords.some((record) => record.workout_date === workoutDate);
    }
    if (routine.id === "sat") {
      return pullRecords.some((record) => record.workout_date === workoutDate);
    }
    return completionRecords.some(
      (record) => record.workout_date === workoutDate && record.routine_id === routine.id,
    );
  }

  async function loadRecords() {
    if (!supabase) return;
    const [sessionResult, completionResult] = await Promise.all([
      supabase
        .from("workout_sessions")
        .select("id, workout_date, workout_type, target_total, total_reps, set_count, created_at")
        .order("workout_date", { ascending: false }),
      supabase
        .from("routine_completions")
        .select("id, workout_date, routine_id, completed_at")
        .order("workout_date", { ascending: false }),
    ]);

    if (!sessionResult.error) {
      const records = (sessionResult.data ?? []) as WorkoutSession[];
      setPushRecords(records.filter((record) => record.workout_type === "pushup"));
      setPullRecords(records.filter((record) => record.workout_type === "pullup"));
    }
    if (!completionResult.error) {
      setCompletionRecords((completionResult.data ?? []) as RoutineCompletion[]);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setPushRecords([]);
        setPullRecords([]);
        setCompletionRecords([]);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error_code") === "otp_expired") {
      setAuthNotice("기존 이메일 링크가 만료됐습니다. 이메일을 입력해 새 로그인 링크를 받아주세요.");
      setSelectedId("thu");
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  useEffect(() => {
    if (session) void loadRecords();
  }, [session]);

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
          <div className="topbar-meta">
            <span className={`auth-state ${session ? "connected" : ""}`}>
              <span aria-hidden="true" />
              {session ? "기록 로그인됨" : "기록 미로그인"}
            </span>
            <span className="period">2026.07.23 — 10.20</span>
          </div>
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
            <div><span>GOAL</span><strong>풀업 15 · 푸쉬업 60</strong></div>
          </div>
        </div>
      </header>

      <main>
        {authNotice && (
          <div className="auth-alert" role="alert">
            <strong>로그인 링크 만료</strong>
            <span>{authNotice}</span>
            <button type="button" onClick={() => setAuthNotice("")} aria-label="로그인 알림 닫기">×</button>
          </div>
        )}
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
              const workoutDate = toDateInputValue(date);
              const isToday = routine.id === todayId;
              const isSelected = routine.id === selectedId;
              const isCompleted = isRoutineCompleted(routine, workoutDate);

              return (
                <button
                  ref={isSelected ? selectedRef : undefined}
                  className={`day-button ${routine.status} ${isCompleted ? "done" : ""} ${isSelected ? "selected" : ""}`}
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
                    {isCompleted ? (
                      <><Check size={12} /> {isToday ? "TODAY · DONE" : "DONE"}</>
                    ) : isToday ? "TODAY" : routine.status === "ready" ? "FIXED" : "WAITING"}
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
                    <div>
                      <h3>{exercise.name}</h3>
                      {exercise.note && <p>{exercise.note}</p>}
                      {exercise.guides && (
                        <div className="exercise-guide-links" aria-label={`${exercise.name} 영상 가이드`}>
                          {exercise.guides.map((guide) => (
                            <a key={guide.url} className="exercise-guide" href={guide.url} target="_blank" rel="noreferrer">
                              <Play size={10} fill="currentColor" aria-hidden="true" />
                              {guide.label}
                              <ArrowUpRight size={11} aria-hidden="true" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
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

              {selected.id === "thu" && (
                <WorkoutResultForm
                  workoutType="pushup"
                  session={session}
                  records={pushRecords}
                  currentTarget={pushTarget}
                  defaultDate={getThisWeeksThursday(today)}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === "sat" && (
                <WorkoutResultForm
                  workoutType="pullup"
                  session={session}
                  records={pullRecords}
                  currentTarget={pullTarget}
                  defaultDate={getThisWeeksSaturday(today)}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {selected.id !== "thu" && selected.id !== "sat" && (
                <RoutineCompletionPanel
                  routine={selected}
                  workoutDate={selectedWorkoutDate}
                  session={session}
                  completed={isRoutineCompleted(selected, selectedWorkoutDate)}
                  onChanged={loadRecords}
                />
              )}
            </div>
          )}
        </section>

        <p className="safety">
          예리한 통증·흉통·어지럼증이 있으면 즉시 중단합니다. 이 페이지는 직접 정한 운동 계획을 정리한 것이며 의료 진단이나 치료를 대신하지 않습니다.
          운동 기록은 Supabase의 로그인 계정에 저장되며, 이메일 주소 외 민감한 건강정보는 수집하지 않습니다.
        </p>
      </main>

      <footer><span>LUKE / 90 DAYS</span><span>THU 2026.07.23 — TUE 2026.10.20</span></footer>
    </>
  );
}

export default App;
