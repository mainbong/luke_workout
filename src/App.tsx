import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowUpRight,
  Check,
  Dumbbell,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  Save,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AdminMonthlyPanel } from "./AdminMonthlyPanel";
import {
  countMissionWorkoutDays,
  nextFiveSetTarget,
  nextPlankTarget,
  nextPullTarget,
  nextPushTarget,
} from "./progression";
import {
  DEFAULT_WORKOUT_PROGRAM_VERSIONS,
  DEFAULT_WORKOUT_PROGRAM_VERSION,
  findProgramVersionForDate,
  findProgramVersionForRecord,
  isGearSecondDate,
  parseWorkoutProgramVersion,
  renderProgramRoutines,
  type ProgramDefinition,
  type Routine,
  type WorkoutProgramVersion,
} from "./program";
import { recordOutcome, routineIdForDate } from "./adminCalendar";
import { currentRoutineCompletions, currentWorkoutSessions } from "./recordEvents";
import {
  isSupabaseConfigured,
  supabase,
  type AdminRoutineHistoryRecord,
  type RoutineCompletion,
  type RoutineCompletionEvent,
  type WorkoutDetails,
  type WorkoutSession,
  type WorkoutSessionEvent,
} from "./supabase";

const START_DATE_VALUE = "2026-07-23";
const START_DATE = new Date(`${START_DATE_VALUE}T00:00:00+09:00`);
const END_DATE = "2026-10-20";
const TOTAL_DAYS = 90;
const ADMIN_EMAIL = "mainbbong@gmail.com";

function getSeoulToday() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + amount);
  next.setHours(0, 0, 0, 0);
  return next;
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

function getJourneyDay(date: Date) {
  return Math.min(
    TOTAL_DAYS,
    Math.max(1, Math.floor((date.getTime() - START_DATE.getTime()) / 86_400_000) + 1),
  );
}

function getJourneyWeek(date: Date) {
  return Math.min(13, Math.max(1, Math.floor((getJourneyDay(date) - 1) / 7) + 1));
}

function formatWorkoutDate(value: string) {
  const [, month, day] = value.split("-").map(Number);
  return `${month}월 ${day}일`;
}

function formatRecordedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getJourneyWeekFromValue(value: string) {
  return getJourneyWeek(new Date(`${value}T00:00:00+09:00`));
}

function buildRoutines(
  definition: ProgramDefinition,
  pushTarget: number,
  pullTarget: number,
  recoveryPushTarget: number,
  sundayPullupTarget: number,
  plankHoldSeconds: number,
  plankRestSeconds: number,
  pushIncrement: number,
  pullIncrement: number,
  pushEarlyIncrement: number,
  plankHoldIncrement: number,
  plankRestIncrement: number,
  latestPushRecord?: WorkoutSession,
  latestPullRecord?: WorkoutSession,
  latestRecoveryPushRecord?: WorkoutSession,
  latestSundayPullupRecord?: WorkoutSession,
): Routine[] {
  const routines = renderProgramRoutines(definition, {
    pushTarget,
    nextPushTarget: pushTarget + pushIncrement,
    nextPushEarlyTarget: pushTarget + pushEarlyIncrement,
    pullTarget,
    nextPullTarget: pullTarget + pullIncrement,
    recoveryPushTarget,
    sundayPullupTarget,
    plankHoldSeconds,
    plankRestSeconds,
    nextPlankHoldSeconds: plankHoldSeconds + plankHoldIncrement,
    nextPlankRestSeconds: plankRestSeconds + plankRestIncrement,
  });
  const records: Record<string, string | undefined> = {
    mon: latestRecoveryPushRecord
      ? `${formatWorkoutDate(latestRecoveryPushRecord.workout_date)} 최근 기록 · ${latestRecoveryPushRecord.set_reps?.join(" · ")}회`
      : undefined,
    thu: latestPushRecord
      ? `${formatWorkoutDate(latestPushRecord.workout_date)} 최근 기록 · ${latestPushRecord.total_reps} / ${latestPushRecord.target_total}회`
      : undefined,
    [definition.progressions.pullup.routineId]: latestPullRecord
      ? `${formatWorkoutDate(latestPullRecord.workout_date)} 최근 기록 · ${latestPullRecord.total_reps} / ${latestPullRecord.target_total}회 · ${latestPullRecord.set_count}세트`
      : undefined,
    sun: latestSundayPullupRecord
      ? `${formatWorkoutDate(latestSundayPullupRecord.workout_date)} 최근 맨몸 풀업 · ${latestSundayPullupRecord.set_reps?.join(" · ")}회`
      : undefined,
  };
  return routines.map((routine) => records[routine.id] ? { ...routine, record: records[routine.id] } : routine);
}

function WorkoutResultForm({
  workoutType,
  session,
  records,
  programVersions,
  defaultDate,
  initialMessage,
  onSaved,
}: {
  workoutType: "pushup" | "pullup";
  session: Session | null;
  records: WorkoutSession[];
  programVersions: WorkoutProgramVersion[];
  defaultDate: string;
  initialMessage?: string;
  onSaved: () => Promise<void>;
}) {
  const isPullup = workoutType === "pullup";
  const [email, setEmail] = useState("");
  const [workoutDate, setWorkoutDate] = useState(defaultDate);
  const [totalReps, setTotalReps] = useState("");
  const [setCount, setSetCount] = useState("");
  const [treadmillSpeed, setTreadmillSpeed] = useState("");
  const [plankSucceeded, setPlankSucceeded] = useState(false);
  const [plankHoldSeconds, setPlankHoldSeconds] = useState("");
  const [plankRestSeconds, setPlankRestSeconds] = useState("");
  const [message, setMessage] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);
  const savedRecord = records.find((record) => record.workout_date === workoutDate);
  const dateProgramVersion = findProgramVersionForDate(programVersions, workoutDate);
  const recordProgramVersion = savedRecord
    ? findProgramVersionForRecord(programVersions, savedRecord)
    : dateProgramVersion;
  const recordVersionMissing = Boolean(savedRecord?.program_version_id && !recordProgramVersion);
  const activeProgramVersion = recordProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION;
  const progressionRule = isPullup
    ? activeProgramVersion.definition.progressions.pullup
    : activeProgramVersion.definition.progressions.pushup;
  const plankRule = isPullup ? undefined : activeProgramVersion.definition.progressions.plank;
  const needsTreadmillSpeed = isPullup && progressionRule.routineId === "wed";
  const needsPushSetCount = !isPullup && progressionRule.earlySuccessSetCount !== undefined;
  const needsSetCount = isPullup || needsPushSetCount;
  const routineDayName = activeProgramVersion.definition.days
    .find((routine) => routine.id === progressionRule.routineId)?.ko ?? progressionRule.routineId;
  const priorRecords = records.filter((record) => record.workout_date < workoutDate);
  const priorRecord = priorRecords[0];
  const priorProgramVersion = priorRecord
    ? findProgramVersionForRecord(programVersions, priorRecord)
    : dateProgramVersion;
  const priorVersionMissing = Boolean(priorRecord && !priorProgramVersion);
  const priorRule = isPullup
    ? (priorProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.pullup
    : (priorProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.pushup;
  const targetIncrement = progressionRule.increment;
  const successSetCount = progressionRule.successSetCount ?? 10;
  const currentTarget = savedRecord?.target_total
    ?? (priorVersionMissing
      ? priorRecord!.target_total
      : isPullup
        ? nextPullTarget(
            priorRecords,
            progressionRule.initialTarget,
            priorRule.increment,
            priorRule.successSetCount ?? 10,
          )
        : nextPushTarget(
            priorRecords,
            progressionRule.initialTarget,
            priorRule.increment,
            priorRule.earlyIncrement ?? priorRule.increment,
            priorRule.earlySuccessSetCount ?? 0,
          ));
  const priorPlankRule = priorProgramVersion?.definition.progressions.plank ?? plankRule;
  const savedPlankDetails = savedRecord?.details;
  const currentPlankTarget = plankRule
    ? savedPlankDetails
      && Number.isInteger(savedPlankDetails.plank_hold_seconds)
      && Number.isInteger(savedPlankDetails.plank_rest_seconds)
        ? {
            holdSeconds: savedPlankDetails.plank_hold_seconds!,
            restSeconds: savedPlankDetails.plank_rest_seconds!,
          }
        : nextPlankTarget(
            priorRecords,
            plankRule.initialHoldSeconds,
            plankRule.initialRestSeconds,
            priorPlankRule?.holdIncrementSeconds ?? plankRule.holdIncrementSeconds,
            priorPlankRule?.restIncrementSeconds ?? plankRule.restIncrementSeconds,
          )
    : null;

  useEffect(() => {
    if (initialMessage) setMessage(initialMessage);
  }, [initialMessage]);

  useEffect(() => {
    if (savedRecord) {
      setTotalReps(String(savedRecord.total_reps));
      setSetCount(savedRecord.set_count === null ? "" : String(savedRecord.set_count));
      setTreadmillSpeed(savedRecord.details.treadmill_speed?.toString() ?? "");
      setPlankSucceeded(savedRecord.details.plank_succeeded ?? false);
      setPlankHoldSeconds(savedRecord.details.plank_hold_seconds?.toString() ?? "");
      setPlankRestSeconds(savedRecord.details.plank_rest_seconds?.toString() ?? "");
    } else {
      setTotalReps("");
      setSetCount("");
      setTreadmillSpeed("");
      setPlankSucceeded(false);
      setPlankHoldSeconds(currentPlankTarget?.holdSeconds.toString() ?? "");
      setPlankRestSeconds(currentPlankTarget?.restSeconds.toString() ?? "");
    }
  }, [currentPlankTarget?.holdSeconds, currentPlankTarget?.restSeconds, isPullup, savedRecord, workoutDate]);

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
    const sets = needsSetCount ? Number(setCount) : null;
    if (isPullup && (!Number.isInteger(sets) || sets === null || sets < 1)) {
      setMessage("풀업 완료 세트 수는 1 이상의 정수로 입력해주세요.");
      return;
    }
    if (needsPushSetCount && (!Number.isInteger(sets) || sets === null || sets < 1 || sets > 5)) {
      setMessage("푸쉬업 완료 세트 수는 1~5 사이의 정수로 입력해주세요.");
      return;
    }
    if (routineIdForDate(workoutDate) !== progressionRule.routineId) {
      setMessage(`${isPullup ? "풀업" : "푸쉬업"} 기록은 ${routineDayName} 날짜로 입력해주세요.`);
      return;
    }

    const existing = records.find((record) => record.workout_date === workoutDate);
    const programVersionId = dateProgramVersion?.id;
    if (!existing && !programVersionId) {
      setMessage("이 날짜에 적용할 운동 프로그램 버전이 없습니다.");
      return;
    }
    const target = existing?.target_total ?? currentTarget;
    const reps = isPullup ? target : Number(totalReps);
    if (!Number.isInteger(reps) || reps < 0) {
      setMessage("합계는 0 이상의 정수로 입력해주세요.");
      return;
    }
    const speed = needsTreadmillSpeed ? Number(treadmillSpeed) : undefined;
    if (needsTreadmillSpeed && (!Number.isFinite(speed) || speed! < 7)) {
      setMessage("러닝머신 유지 속도는 7 이상으로 입력해주세요.");
      return;
    }
    const holdSeconds = plankRule ? Number(plankHoldSeconds) : undefined;
    const restSeconds = plankRule ? Number(plankRestSeconds) : undefined;
    if (plankRule && (
      !Number.isInteger(holdSeconds) || holdSeconds! < 1
      || !Number.isInteger(restSeconds) || restSeconds! < 1
    )) {
      setMessage("플랭크 Hold와 휴식 시간은 1초 이상의 정수로 입력해주세요.");
      return;
    }

    setBusy(true);
    setMessage("");
    const details: WorkoutDetails = {
      ...(existing?.details ?? {}),
      ...(needsTreadmillSpeed ? { treadmill_speed: speed } : {}),
      ...(plankRule ? {
        plank_succeeded: plankSucceeded,
        plank_hold_seconds: holdSeconds,
        plank_rest_seconds: restSeconds,
      } : {}),
    };
    const values = { target_total: target, total_reps: reps, set_count: sets, details };
    const { error } = await supabase.from("workout_sessions").insert({
      ...values,
      user_id: session.user.id,
      workout_date: workoutDate,
      workout_type: workoutType,
      program_version_id: programVersionId!,
    });

    if (error) {
      setMessage(`저장하지 못했습니다: ${error.message}`);
    } else {
      await onSaved();
      if (recordVersionMissing) {
        setMessage("저장 완료 · 연결된 프로그램 버전 확인 필요");
      } else {
        const followingTarget = isPullup
          ? nextPullTarget(
              [{ target_total: target, total_reps: reps, set_count: sets }],
              target,
              progressionRule.increment,
              successSetCount,
            )
          : nextPushTarget(
              [{ target_total: target, total_reps: reps, set_count: sets }],
              target,
              progressionRule.increment,
              progressionRule.earlyIncrement ?? progressionRule.increment,
              progressionRule.earlySuccessSetCount ?? 0,
            );
        const plankMessage = plankRule && currentPlankTarget
          ? ` · 플랭크 다음 ${currentPlankTarget.holdSeconds + (plankSucceeded ? plankRule.holdIncrementSeconds : 0)}/${currentPlankTarget.restSeconds + (plankSucceeded ? plankRule.restIncrementSeconds : 0)}초`
          : "";
        setMessage(`저장 완료 · 다음 목표 ${followingTarget}회${plankMessage}`);
      }
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
          <h3 id="result-title">{routineDayName} {isPullup ? "풀업" : "푸쉬업"} 결과 입력</h3>
          <p>
            {recordVersionMissing
              ? "저장된 목표와 결과만 수정할 수 있으며 다음 목표는 프로그램 버전을 확인한 뒤 계산합니다."
              : isPullup
                ? "목표 횟수를 완료하는 데 사용한 세트 수를 적으면 다음 목표를 자동 계산합니다."
                : needsPushSetCount
                  ? "푸쉬업 합계와 완료 세트 수, 플랭크 결과를 적으면 다음 목표를 자동 계산합니다."
                  : "5세트의 합계만 적으면 다음 목표를 자동 계산합니다."}
          </p>
        </div>
        <button className="text-button" type="button" onClick={signOut}>
          <LogOut size={14} aria-hidden="true" /> 로그아웃
        </button>
      </div>
      <form className="recovery-result-form" onSubmit={saveResult}>
        <div className="record-inputs">
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
              푸쉬업 전체 합계
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
          {needsSetCount && (
            <label>
              목표 완료 세트 수
              <span className="number-input">
                <input
                  type="number"
                  min="1"
                  max={needsPushSetCount ? 5 : undefined}
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
          {needsTreadmillSpeed && (
            <label>
              러닝머신 15분 유지 속도
              <span className="number-input">
                <input
                  type="number"
                  min="7"
                  step="0.1"
                  inputMode="decimal"
                  value={treadmillSpeed}
                  onChange={(event) => setTreadmillSpeed(event.target.value)}
                  required
                />
                <span>속도</span>
              </span>
            </label>
          )}
          {plankRule && (
            <>
              <label>
                플랭크 Hold
                <span className="number-input">
                  <input type="number" min="1" step="1" inputMode="numeric" value={plankHoldSeconds} onChange={(event) => setPlankHoldSeconds(event.target.value)} required />
                  <span>초</span>
                </span>
              </label>
              <label>
                플랭크 휴식
                <span className="number-input">
                  <input type="number" min="1" step="1" inputMode="numeric" value={plankRestSeconds} onChange={(event) => setPlankRestSeconds(event.target.value)} required />
                  <span>초</span>
                </span>
              </label>
              <label className="optional-metric">
                <input type="checkbox" checked={plankSucceeded} onChange={(event) => setPlankSucceeded(event.target.checked)} />
                <span>플랭크 3세트 성공</span>
                <small>3세트를 모두 완료했을 때만 체크합니다.</small>
              </label>
            </>
          )}
        </div>
        <button className="save-button" type="submit" disabled={busy}>
          <Save size={17} aria-hidden="true" />
          {busy ? "저장 중" : savedRecord ? "기록 수정" : "결과 저장"}
        </button>
      </form>
      {recordVersionMissing ? (
        <p className="form-message" role="alert">연결된 프로그램 버전을 불러오지 못해 다음 목표를 계산하지 않습니다.</p>
      ) : priorVersionMissing ? (
        <p className="form-message" role="alert">직전 기록의 프로그램 버전을 불러오지 못해 이번 목표를 {currentTarget}회로 유지합니다.</p>
      ) : (
        <p className="rule-preview">
          이번 목표 <strong>{savedRecord?.target_total ?? currentTarget}회</strong>
          <span aria-hidden="true">→</span>
          {isPullup ? (
            <>{successSetCount}세트 이내 <strong>+{targetIncrement}</strong> · 초과 <strong>유지</strong></>
          ) : progressionRule.earlyIncrement && progressionRule.earlySuccessSetCount ? (
            <>{progressionRule.earlySuccessSetCount}세트 이내 <strong>+{progressionRule.earlyIncrement}</strong> · 5세트 성공 <strong>+{targetIncrement}</strong> · 실패 <strong>유지</strong></>
          ) : (
            <>성공 <strong>+{targetIncrement}</strong> · 실패 <strong>유지</strong></>
          )}
        </p>
      )}
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

function FiveSetProgressForm({
  workoutType,
  session,
  records,
  programVersions,
  defaultDate,
  onSaved,
}: {
  workoutType: "recovery_pushup" | "sunday_pullup";
  session: Session | null;
  records: WorkoutSession[];
  programVersions: WorkoutProgramVersion[];
  defaultDate: string;
  onSaved: () => Promise<void>;
}) {
  const isSundayPullup = workoutType === "sunday_pullup";
  const dayName = isSundayPullup ? "일요일" : "월요일";
  const resultTitleId = `${workoutType}-result-title`;
  const loginEmailId = `${workoutType}-login-email`;
  const [email, setEmail] = useState("");
  const [workoutDate, setWorkoutDate] = useState(defaultDate);
  const [setReps, setSetReps] = useState(["", "", "", "", ""]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const savedRecord = records.find((record) => record.workout_date === workoutDate);
  const dateProgramVersion = findProgramVersionForDate(programVersions, workoutDate);
  const recordProgramVersion = savedRecord
    ? findProgramVersionForRecord(programVersions, savedRecord)
    : dateProgramVersion;
  const recordVersionMissing = Boolean(savedRecord?.program_version_id && !recordProgramVersion);
  const progressionRule = isSundayPullup
    ? (recordProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.sunday_pullup
    : (recordProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.recovery_pushup;
  const priorRecords = records.filter((record) => record.workout_date < workoutDate);
  const priorRecord = priorRecords[0];
  const priorProgramVersion = priorRecord
    ? findProgramVersionForRecord(programVersions, priorRecord)
    : dateProgramVersion;
  const priorVersionMissing = Boolean(priorRecord && !priorProgramVersion);
  const priorRule = isSundayPullup
    ? (priorProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.sunday_pullup
    : (priorProgramVersion ?? dateProgramVersion ?? DEFAULT_WORKOUT_PROGRAM_VERSION).definition.progressions.recovery_pushup;
  const targetIncrement = progressionRule.increment;
  const currentTarget = savedRecord?.target_total
    ?? (priorVersionMissing
      ? priorRecord!.target_total
      : nextFiveSetTarget(
          priorRecords,
          progressionRule.initialTarget,
          priorRule.increment,
        ));

  useEffect(() => {
    if (savedRecord?.set_reps) {
      setSetReps(savedRecord.set_reps.map(String));
    } else {
      setSetReps(["", "", "", "", ""]);
    }
  }, [savedRecord, workoutDate]);

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
    setMessage(error ? error.message : "로그인 링크를 보냈습니다. 가장 최근 메일의 링크를 열어주세요.");
  }

  async function saveResult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !session) return;
    const workoutDay = new Date(`${workoutDate}T00:00:00+09:00`).getDay();
    if (workoutDay !== (isSundayPullup ? 0 : 1)) {
      setMessage(`${dayName} 기록은 ${dayName} 날짜로 입력해주세요.`);
      return;
    }

    const reps = setReps.map(Number);
    if (reps.some((value) => !Number.isInteger(value) || value < 0)) {
      setMessage("각 세트 횟수를 0 이상의 정수로 입력해주세요.");
      return;
    }

    const programVersionId = dateProgramVersion?.id;
    if (!savedRecord && !programVersionId) {
      setMessage("이 날짜에 적용할 운동 프로그램 버전이 없습니다.");
      return;
    }
    const target = savedRecord?.target_total ?? currentTarget;
    setBusy(true);
    setMessage("");
    const values = {
      target_total: target,
      total_reps: reps.reduce((sum, value) => sum + value, 0),
      set_count: 5,
      set_reps: reps,
    };
    const { error } = await supabase.from("workout_sessions").insert({
      ...values,
      user_id: session.user.id,
      workout_date: workoutDate,
      workout_type: workoutType,
      program_version_id: programVersionId!,
    });

    if (error) {
      setMessage(`저장하지 못했습니다: ${error.message}`);
    } else {
      await onSaved();
      if (recordVersionMissing) {
        setMessage("저장 완료 · 연결된 프로그램 버전 확인 필요");
      } else {
        const succeeded = reps.every((value) => value >= target);
        setMessage(`저장 완료 · 다음 목표 ${succeeded ? target + targetIncrement : target}회 × 5세트`);
      }
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  if (!session) {
    return (
      <section className="result-panel" aria-labelledby={resultTitleId}>
        <div>
          <p className="eyebrow dark">RESULT LOG</p>
          <h3 id={resultTitleId}>이메일로 기록 시작</h3>
          <p>신규 사용자는 {currentTarget}회 × 5세트에서 시작하고, 목표는 내 성공 기록으로만 계산됩니다.</p>
        </div>
        <form className="login-form" onSubmit={sendMagicLink}>
          <label htmlFor={loginEmailId}>이메일</label>
          <div>
            <input
              id={loginEmailId}
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
    <section className="result-panel" aria-labelledby={resultTitleId}>
      <div className="result-heading">
        <div>
          <p className="eyebrow dark">RESULT LOG</p>
          <h3 id={resultTitleId}>{dayName} 5세트 결과 입력</h3>
          <p>
            {recordVersionMissing
              ? "저장된 목표와 세트별 횟수만 수정할 수 있으며 다음 목표는 프로그램 버전을 확인한 뒤 계산합니다."
              : <>{isSundayPullup ? "각 세트에서 머신 도움 없이 성공한 맨몸 횟수만 입력하세요. " : ""}5세트 모두 이번 목표 이상이면 다음 {dayName}부터 세트당 {targetIncrement}회가 올라갑니다.</>}
          </p>
        </div>
        <button className="text-button" type="button" onClick={() => void signOut()}>
          <LogOut size={14} aria-hidden="true" /> 로그아웃
        </button>
      </div>
      <form className="recovery-result-form" onSubmit={saveResult}>
        <label className="recovery-date">
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
        <fieldset>
          <legend>세트별 {isSundayPullup ? "맨몸 성공" : "실제"} 횟수</legend>
          <div className="set-reps-grid">
            {setReps.map((value, index) => (
              <label key={index}>
                {index + 1}세트
                <span className="number-input">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={value}
                    onChange={(event) => {
                      const next = [...setReps];
                      next[index] = event.target.value;
                      setSetReps(next);
                    }}
                    required
                  />
                  <span>회</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button className="save-button" type="submit" disabled={busy}>
          <Save size={17} aria-hidden="true" />
          {busy ? "저장 중" : savedRecord ? "기록 수정" : "결과 저장"}
        </button>
      </form>
      {recordVersionMissing ? (
        <p className="form-message" role="alert">연결된 프로그램 버전을 불러오지 못해 다음 목표를 계산하지 않습니다.</p>
      ) : priorVersionMissing ? (
        <p className="form-message" role="alert">직전 기록의 프로그램 버전을 불러오지 못해 이번 목표를 {currentTarget}회 × 5세트로 유지합니다.</p>
      ) : (
        <p className="rule-preview">
          이번 목표 <strong>{savedRecord?.target_total ?? currentTarget}회 × 5</strong>
          <span aria-hidden="true">→</span>
          5세트 모두 성공 <strong>세트당 +{targetIncrement}</strong> · 실패 <strong>유지</strong>
        </p>
      )}
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

function UserRoutineHistory({
  routine,
  workoutRecords,
  completionRecords,
  programVersions,
}: {
  routine: Routine;
  workoutRecords: WorkoutSessionEvent[];
  completionRecords: RoutineCompletionEvent[];
  programVersions: WorkoutProgramVersion[];
}) {
  const completions = completionRecords.filter((record) => record.routine_id === routine.id);
  const records = [...workoutRecords, ...completions].sort((a, b) =>
    b.workout_date.localeCompare(a.workout_date)
    || (b.event_order ?? 0) - (a.event_order ?? 0)
    || ("updated_at" in b ? b.updated_at : b.completed_at)
      .localeCompare("updated_at" in a ? a.updated_at : a.completed_at)
    || b.id.localeCompare(a.id));

  return (
    <section className="history-panel" aria-labelledby="user-history-title">
      <div className="history-heading">
        <div>
          <p className="eyebrow dark">MY HISTORY</p>
          <h3 id="user-history-title">내 주차별 기록</h3>
        </div>
        <strong>{records.length}회</strong>
      </div>
      {records.length === 0 ? (
        <p className="history-empty">아직 이 요일에 저장한 기록이 없습니다.</p>
      ) : (
        <div className="history-list">
          {records.map((record) => {
            if ("workout_type" in record) {
              const recordProgramVersion = findProgramVersionForRecord(programVersions, record);
              const recordProgression = recordProgramVersion?.definition.progressions;
              const isFiveSet = record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup";
              const outcome = recordOutcome({ ...record, record_kind: "workout_session" }, programVersions);
              let progressionLabel = "목표 유지";
              if (recordProgression && outcome.state === "pr") {
                if (record.workout_type === "pushup") {
                  const nextTarget = nextPushTarget(
                    [record],
                    record.target_total,
                    recordProgression.pushup.increment,
                    recordProgression.pushup.earlyIncrement ?? recordProgression.pushup.increment,
                    recordProgression.pushup.earlySuccessSetCount ?? 0,
                  );
                  progressionLabel = nextTarget > record.target_total
                    ? `다음 푸쉬업 +${nextTarget - record.target_total}`
                    : "플랭크 목표 상승";
                } else {
                  const increment = record.workout_type === "recovery_pushup"
                    ? recordProgression.recovery_pushup.increment
                    : record.workout_type === "sunday_pullup"
                      ? recordProgression.sunday_pullup.increment
                      : recordProgression.pullup.increment;
                  progressionLabel = `다음 목표 +${increment}${isFiveSet ? "/세트" : ""}`;
                }
              }
              const result = isFiveSet
                ? `${record.set_reps?.join(" · ")}회 / 목표 ${record.target_total}×5`
                : record.workout_type === "pullup"
                  ? `목표 ${record.target_total}회 · ${record.set_count}세트${record.details.treadmill_speed ? ` · 러닝 속도 ${record.details.treadmill_speed}` : ""}`
                  : `${record.total_reps} / ${record.target_total}회${record.set_count ? ` · ${record.set_count}세트` : ""}${record.details.plank_hold_seconds ? ` · 플랭크 ${record.details.plank_hold_seconds}/${record.details.plank_rest_seconds}초 ${record.details.plank_succeeded ? "성공" : "유지"}` : ""}`;
              return (
                <article key={record.id}>
                  <div><strong>{formatWorkoutDate(record.workout_date)}</strong><small>WEEK {getJourneyWeekFromValue(record.workout_date)} · {formatRecordedAt(record.updated_at)}</small></div>
                  <span>{result}</span>
                  <em className={record.is_current && outcome.state === "pr" ? "success" : "keep"}>
                    {!record.is_current
                      ? "수정 전"
                      : !recordProgramVersion
                      ? "프로그램 버전 확인 필요"
                      : progressionLabel}
                  </em>
                </article>
              );
            }
            const detail = record.details.dips_max_reps !== undefined
              ? `딥스 1세트 ${record.details.dips_max_reps}회 · 러닝 속도 ${record.details.treadmill_speed}`
              : routine.id === "tue" ? "휴식 완료" : "루틴 완료";
            return (
              <article key={record.id}>
                <div><strong>{formatWorkoutDate(record.workout_date)}</strong><small>WEEK {getJourneyWeekFromValue(record.workout_date)} · {formatRecordedAt(record.completed_at)}</small></div>
                <span>{detail}</span>
                <em className={record.is_current && record.is_completed ? "success" : "keep"}>
                  {!record.is_completed ? "CANCELED" : record.is_current ? "DONE" : "이전 완료"}
                </em>
              </article>
            );
          })}
        </div>
      )}
      <p className="history-note">같은 날짜의 수정 전·후 값과 완료 취소도 삭제 없이 시간순으로 쌓입니다.</p>
    </section>
  );
}

function RoutineCompletionPanel({
  routine,
  workoutDate,
  session,
  completionRecord,
  programVersionId,
  onChanged,
}: {
  routine: Routine;
  workoutDate: string;
  session: Session | null;
  completionRecord?: RoutineCompletion;
  programVersionId: string;
  onChanged: () => Promise<void>;
}) {
  const completed = Boolean(completionRecord);
  const needsPressMetrics = routine.id === "sat" && routine.completion === true;
  const [email, setEmail] = useState("");
  const [dipsMaxReps, setDipsMaxReps] = useState("");
  const [treadmillSpeed, setTreadmillSpeed] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDipsMaxReps(completionRecord?.details.dips_max_reps?.toString() ?? "");
    setTreadmillSpeed(completionRecord?.details.treadmill_speed?.toString() ?? "");
  }, [completionRecord, workoutDate]);

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

  function pressDetails(): WorkoutDetails | null {
    if (!needsPressMetrics) return {};
    if (dipsMaxReps.trim() === "" || treadmillSpeed.trim() === "") {
      setMessage("딥스 최대 횟수와 러닝머신 속도를 모두 입력해주세요.");
      return null;
    }
    const reps = Number(dipsMaxReps);
    const speed = Number(treadmillSpeed);
    if (!Number.isInteger(reps) || reps < 0 || !Number.isFinite(speed) || speed < 10) {
      setMessage("딥스 최대 횟수는 0 이상의 정수, 러닝머신 속도는 10 이상으로 입력해주세요.");
      return null;
    }
    return { dips_max_reps: reps, treadmill_speed: speed };
  }

  async function saveCompletion(details: WorkoutDetails) {
    if (!supabase || !session) return false;
    const query = supabase.from("routine_completions").insert({
      user_id: session.user.id,
      workout_date: workoutDate,
      routine_id: routine.id,
      program_version_id: programVersionId,
      details,
      is_completed: true,
    });
    const { error } = await query;
    if (error) {
      setMessage(`완료 상태를 저장하지 못했습니다: ${error.message}`);
      return false;
    }
    await onChanged();
    return true;
  }

  async function toggleCompletion() {
    if (!supabase || !session) return;
    setBusy(true);
    setMessage("");
    if (!completed) {
      const details = pressDetails();
      if (!details) {
        setBusy(false);
        return;
      }
      if (await saveCompletion(details)) setMessage("운동 완료를 기록했습니다.");
    } else {
      const { error } = await supabase.from("routine_completions").insert({
        user_id: session.user.id,
        workout_date: workoutDate,
        routine_id: routine.id,
        program_version_id: programVersionId,
        details: completionRecord!.details,
        is_completed: false,
      });
      if (error) setMessage(`완료 상태를 저장하지 못했습니다: ${error.message}`);
      else {
        await onChanged();
        setMessage("완료 체크를 취소했습니다.");
      }
    }
    setBusy(false);
  }

  async function updatePressMetrics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const details = pressDetails();
    if (!details) return;
    setBusy(true);
    setMessage("");
    if (await saveCompletion(details)) setMessage(completed ? "Press 기록을 수정했습니다." : "Press 루틴 완료를 기록했습니다.");
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
      {needsPressMetrics && (
        <form className="recovery-result-form" onSubmit={updatePressMetrics}>
          <div className="record-inputs">
            <label>
              딥스 1세트 최대 횟수
              <span className="number-input">
                <input type="number" min="0" step="1" inputMode="numeric" value={dipsMaxReps} onChange={(event) => setDipsMaxReps(event.target.value)} required />
                <span>회</span>
              </span>
            </label>
            <label>
              러닝머신 5분 최고 유지 속도
              <span className="number-input">
                <input type="number" min="10" step="0.1" inputMode="decimal" value={treadmillSpeed} onChange={(event) => setTreadmillSpeed(event.target.value)} required />
                <span>속도</span>
              </span>
            </label>
          </div>
          <button className="save-button" type="submit" disabled={busy}>
            <Save size={17} aria-hidden="true" />
            {busy ? "저장 중" : completed ? "Press 기록 수정" : "결과와 완료 저장"}
          </button>
        </form>
      )}
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

function AdminDailyPanel({
  workoutDate,
  routine,
  refreshToken,
}: {
  workoutDate: string;
  routine: Routine;
  refreshToken: number;
}) {
  const [records, setRecords] = useState<AdminRoutineHistoryRecord[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const dailyRecords = records.filter((record) =>
    record.workout_date === workoutDate
    && record.is_current
    && (record.record_kind === "workout_session" || record.is_completed));

  async function loadAdminRecords() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");

    const { data, error } = await supabase.rpc("get_admin_routine_history", {
      target_routine_id: routine.id,
    });

    if (error) {
      setRecords([]);
      setMessage(`관리자 기록을 불러오지 못했습니다: ${error.message}`);
    } else {
      setRecords((data ?? []) as AdminRoutineHistoryRecord[]);
    }
    setBusy(false);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  useEffect(() => {
    void loadAdminRecords();
  }, [routine.id, refreshToken]);

  return (
    <section className="admin-panel" aria-labelledby="admin-panel-title">
      <div className="admin-heading">
        <div className="admin-title">
          <span className="admin-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow dark">ADMIN ONLY</p>
            <h3 id="admin-panel-title">{formatWorkoutDate(workoutDate)} 참여 기록</h3>
          </div>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-refresh" onClick={() => void loadAdminRecords()} disabled={busy}>
            <RefreshCw size={14} aria-hidden="true" />
            {busy ? "확인 중" : "새로고침"}
          </button>
          <button type="button" className="admin-refresh" onClick={() => void signOut()}>
            <LogOut size={14} aria-hidden="true" />
            로그아웃
          </button>
        </div>
      </div>

      <div className="admin-summary">
        <span><Users size={15} aria-hidden="true" /> 기록 사용자</span>
        <strong>{new Set(records.map((record) => record.user_id)).size}명</strong>
        <small>선택 루틴 계보 누적 {records.length}회</small>
      </div>

      {message && <p className="form-message" role="alert">{message}</p>}

      {!busy && !message && dailyRecords.length === 0 && (
        <div className="admin-empty">
          <strong>선택한 날짜에는 저장된 기록이 없습니다.</strong>
          <span>아래 누적 기록에서 이전 주차의 기록을 모두 확인할 수 있습니다.</span>
        </div>
      )}

      {dailyRecords.length > 0 && (
        <div className="admin-records" aria-label={`${formatWorkoutDate(workoutDate)} 사용자 기록`}>
          {dailyRecords.map((record) => {
            const isWorkout = record.record_kind === "workout_session";
            const isFiveSet = record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup";

            return (
              <article key={`${record.record_kind}-${record.user_id}-${record.recorded_at}`}>
                <div className="admin-user">
                  <span>{record.user_email}</span>
                  <small>{formatRecordedAt(record.recorded_at)} 기록</small>
                </div>
                {isWorkout ? (
                  <div className="admin-result">
                    <span>{record.workout_type === "sunday_pullup" ? "일요일 맨몸 풀업" : record.workout_type === "pullup" ? "풀업" : "푸쉬업"}</span>
                    <strong>
                      {isFiveSet
                        ? `${record.set_reps?.join(" · ")}회 / 목표 ${record.target_total}×5`
                        : record.workout_type === "pullup"
                        ? `${record.target_total}회 · ${record.set_count}세트${record.details.treadmill_speed ? ` · 러닝 속도 ${record.details.treadmill_speed}` : ""}`
                        : `${record.total_reps} / ${record.target_total}회${record.set_count ? ` · ${record.set_count}세트` : ""}${record.details.plank_hold_seconds ? ` · 플랭크 ${record.details.plank_hold_seconds}/${record.details.plank_rest_seconds}초 ${record.details.plank_succeeded ? "성공" : "유지"}` : ""}`}
                    </strong>
                    <em className="success">기록됨</em>
                  </div>
                ) : (
                  <div className="admin-result">
                    <span>완료 체크</span>
                    <strong>{record.details.dips_max_reps !== undefined
                      ? `딥스 ${record.details.dips_max_reps}회 · 러닝 속도 ${record.details.treadmill_speed}`
                      : record.routine_id === routine.id ? "이 루틴 완료" : `${record.routine_id} 완료`}</strong>
                    <em className="success">DONE</em>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <div className="admin-history-heading">
        <strong>전체 주차 기록</strong>
        <span>{records.length}회 저장됨</span>
      </div>
      {records.length === 0 ? (
        <div className="admin-empty">
          <strong>아직 누적된 기록이 없습니다.</strong>
          <span>사용자가 이 루틴 계보의 결과나 완료 상태를 저장하면 주차별로 쌓입니다.</span>
        </div>
      ) : (
        <div className="admin-records admin-history-records" aria-label="선택한 루틴 계보 전체 주차 기록">
          {records.map((record) => {
            const isFiveSet = record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup";
            const result = isFiveSet
              ? `${record.set_reps?.join(" · ")}회 / 목표 ${record.target_total}×5`
              : record.workout_type === "pullup"
                ? `목표 ${record.target_total}회 · ${record.set_count}세트${record.details.treadmill_speed ? ` · 러닝 속도 ${record.details.treadmill_speed}` : ""}`
                : record.workout_type === "pushup"
                  ? `${record.total_reps} / ${record.target_total}회${record.set_count ? ` · ${record.set_count}세트` : ""}${record.details.plank_hold_seconds ? ` · 플랭크 ${record.details.plank_hold_seconds}/${record.details.plank_rest_seconds}초 ${record.details.plank_succeeded ? "성공" : "유지"}` : ""}`
                  : record.details.dips_max_reps !== undefined
                    ? `딥스 ${record.details.dips_max_reps}회 · 러닝 속도 ${record.details.treadmill_speed}`
                    : record.routine_id === "tue" ? "휴식 완료" : "루틴 완료";

            return (
              <article key={record.event_id}>
                <div className="admin-user">
                  <span>{record.user_email}</span>
                  <small>{formatWorkoutDate(record.workout_date)} · WEEK {getJourneyWeekFromValue(record.workout_date)} · {formatRecordedAt(record.recorded_at)}</small>
                </div>
                <div className="admin-result">
                  <span>{record.record_kind === "workout_session" ? "결과" : record.is_completed ? "완료 체크" : "완료 취소"}</span>
                  <strong>{result}</strong>
                  <em className={record.is_current && (record.record_kind === "workout_session" || record.is_completed) ? "success" : "keep"}>
                    {record.record_kind === "workout_session"
                      ? record.is_current ? "현재" : "수정 전"
                      : !record.is_completed ? "CANCELED" : record.is_current ? "DONE" : "이전 완료"}
                  </em>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="admin-note">이 정보는 등록된 운영 계정에서만 조회할 수 있으며 다른 사용자의 기록은 수정할 수 없습니다.</p>
    </section>
  );
}

function App() {
  const today = useMemo(getSeoulToday, []);
  const [selectedId, setSelectedId] = useState(() => getTodayRoutineId(today));
  const [programVersions, setProgramVersions] = useState<WorkoutProgramVersion[]>(DEFAULT_WORKOUT_PROGRAM_VERSIONS);
  const [session, setSession] = useState<Session | null>(null);
  const [authNotice, setAuthNotice] = useState("");
  const [pushRecords, setPushRecords] = useState<WorkoutSession[]>([]);
  const [pullRecords, setPullRecords] = useState<WorkoutSession[]>([]);
  const [recoveryPushRecords, setRecoveryPushRecords] = useState<WorkoutSession[]>([]);
  const [sundayPullupRecords, setSundayPullupRecords] = useState<WorkoutSession[]>([]);
  const [completionRecords, setCompletionRecords] = useState<RoutineCompletion[]>([]);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutSessionEvent[]>([]);
  const [completionHistory, setCompletionHistory] = useState<RoutineCompletionEvent[]>([]);
  const [recordsStatus, setRecordsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [recordsRevision, setRecordsRevision] = useState(0);
  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL;
  const todayId = getTodayRoutineId(today);
  const todayValue = toDateInputValue(today);
  const isGearSecondTheme = isGearSecondDate(todayValue);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const weekMapRef = useRef<HTMLDivElement>(null);
  const activeUserIdRef = useRef<string | null>(null);
  const recordsRequestRef = useRef(0);
  const journeyDay = getJourneyDay(today);
  const week = getJourneyWeek(today);
  const progressEndDate = toDateInputValue(today) < END_DATE ? toDateInputValue(today) : END_DATE;
  const completedDays = countMissionWorkoutDays(
    [...pushRecords, ...pullRecords, ...recoveryPushRecords, ...sundayPullupRecords, ...completionRecords],
    START_DATE_VALUE,
    progressEndDate,
  );
  const completionRate = Math.round((completedDays / journeyDay) * 100);
  const visibleDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 3);
      const workoutDate = toDateInputValue(date);
      const routineId = getTodayRoutineId(date);
      const pushRecord = pushRecords.find((record) => record.workout_date === workoutDate);
      const pullRecord = pullRecords.find((record) => record.workout_date === workoutDate);
      const recoveryPushRecord = recoveryPushRecords.find((record) => record.workout_date === workoutDate);
      const sundayPullupRecord = sundayPullupRecords.find((record) => record.workout_date === workoutDate);
      const completionRecord = completionRecords.find(
        (record) => record.workout_date === workoutDate && record.routine_id === routineId,
      );
      const storedVersionId = recoveryPushRecord?.program_version_id
        ?? pushRecord?.program_version_id
        ?? pullRecord?.program_version_id
        ?? sundayPullupRecord?.program_version_id
        ?? completionRecord?.program_version_id;
      const dateActiveProgramVersion = findProgramVersionForDate(programVersions, workoutDate);
      const storedProgramVersion = storedVersionId
        ? programVersions.find((version) => version.id === storedVersionId) ?? null
        : null;
      const programVersionMissing = Boolean(storedVersionId && !storedProgramVersion);
      const dateProgramVersion = storedProgramVersion
        ?? dateActiveProgramVersion
        ?? DEFAULT_WORKOUT_PROGRAM_VERSION;
      const dateProgression = dateProgramVersion.definition.progressions;
      const priorPushRecords = pushRecords.filter((record) => record.workout_date < workoutDate);
      const priorPullRecords = pullRecords.filter((record) => record.workout_date < workoutDate);
      const priorRecoveryPushRecords = recoveryPushRecords.filter((record) => record.workout_date < workoutDate);
      const priorSundayPullupRecords = sundayPullupRecords.filter((record) => record.workout_date < workoutDate);
      const priorPushProgramVersion = priorPushRecords[0]
        ? findProgramVersionForRecord(programVersions, priorPushRecords[0])
        : dateProgramVersion;
      const priorPullProgramVersion = priorPullRecords[0]
        ? findProgramVersionForRecord(programVersions, priorPullRecords[0])
        : dateProgramVersion;
      const priorRecoveryProgramVersion = priorRecoveryPushRecords[0]
        ? findProgramVersionForRecord(programVersions, priorRecoveryPushRecords[0])
        : dateProgramVersion;
      const priorSundayProgramVersion = priorSundayPullupRecords[0]
        ? findProgramVersionForRecord(programVersions, priorSundayPullupRecords[0])
        : dateProgramVersion;
      const priorPushProgression = (priorPushProgramVersion ?? dateProgramVersion).definition.progressions;
      const priorPullProgression = (priorPullProgramVersion ?? dateProgramVersion).definition.progressions;
      const priorRecoveryProgression = (priorRecoveryProgramVersion ?? dateProgramVersion).definition.progressions;
      const priorSundayProgression = (priorSundayProgramVersion ?? dateProgramVersion).definition.progressions;
      const datePushTarget = pushRecord?.target_total ?? nextPushTarget(
        priorPushRecords,
        dateProgression.pushup.initialTarget,
        priorPushProgramVersion ? priorPushProgression.pushup.increment : 0,
        priorPushProgramVersion
          ? priorPushProgression.pushup.earlyIncrement ?? priorPushProgression.pushup.increment
          : 0,
        priorPushProgramVersion ? priorPushProgression.pushup.earlySuccessSetCount ?? 0 : 0,
      );
      const datePullTarget = pullRecord?.target_total ?? nextPullTarget(
        priorPullRecords,
        dateProgression.pullup.initialTarget,
        priorPullProgramVersion ? priorPullProgression.pullup.increment : 0,
        priorPullProgramVersion ? priorPullProgression.pullup.successSetCount ?? 10 : 0,
      );
      const dateRecoveryPushTarget = recoveryPushRecord?.target_total ?? nextFiveSetTarget(
        priorRecoveryPushRecords,
        dateProgression.recovery_pushup.initialTarget,
        priorRecoveryProgramVersion ? priorRecoveryProgression.recovery_pushup.increment : 0,
      );
      const dateSundayPullupTarget = sundayPullupRecord?.target_total ?? nextFiveSetTarget(
        priorSundayPullupRecords,
        dateProgression.sunday_pullup.initialTarget,
        priorSundayProgramVersion ? priorSundayProgression.sunday_pullup.increment : 0,
      );
      const plankRule = dateProgression.plank;
      const priorPlankRule = priorPushProgramVersion?.definition.progressions.plank ?? plankRule;
      const datePlankTarget = plankRule
        ? pushRecord
          && Number.isInteger(pushRecord.details.plank_hold_seconds)
          && Number.isInteger(pushRecord.details.plank_rest_seconds)
            ? {
                holdSeconds: pushRecord.details.plank_hold_seconds!,
                restSeconds: pushRecord.details.plank_rest_seconds!,
              }
            : nextPlankTarget(
                priorPushRecords,
                plankRule.initialHoldSeconds,
                plankRule.initialRestSeconds,
                priorPlankRule?.holdIncrementSeconds ?? plankRule.holdIncrementSeconds,
                priorPlankRule?.restIncrementSeconds ?? plankRule.restIncrementSeconds,
              )
        : { holdSeconds: 40, restSeconds: 20 };
      const routine = buildRoutines(
        dateProgramVersion.definition,
        datePushTarget,
        datePullTarget,
        dateRecoveryPushTarget,
        dateSundayPullupTarget,
        datePlankTarget.holdSeconds,
        datePlankTarget.restSeconds,
        dateProgression.pushup.increment,
        dateProgression.pullup.increment,
        dateProgression.pushup.earlyIncrement ?? dateProgression.pushup.increment,
        plankRule?.holdIncrementSeconds ?? 0,
        plankRule?.restIncrementSeconds ?? 0,
        pushRecord,
        pullRecord,
        recoveryPushRecord,
        sundayPullupRecord,
      ).find((item) => item.id === routineId);

      if (!routine) throw new Error(`Missing routine for ${routineId}`);
      return {
        date,
        workoutDate,
        routine,
        programVersion: dateProgramVersion,
        programVersionId: dateActiveProgramVersion?.id ?? dateProgramVersion.id,
        programVersionMissing,
      };
    }),
    [completionRecords, programVersions, pullRecords, pushRecords, recoveryPushRecords, sundayPullupRecords, today],
  );
  const selectedDay = visibleDays.find(({ routine }) => routine.id === selectedId) ?? visibleDays[3];
  const selected = selectedDay.routine;
  const selectedWorkoutDate = selectedDay.workoutDate;
  const selectedProgramVersion = selectedDay.programVersion;
  const selectedProgressions = selectedProgramVersion.definition.progressions;
  const programVersionId = selectedDay.programVersionId;
  const selectedCompletionRecord = completionRecords.find(
    (record) => record.workout_date === selectedWorkoutDate && record.routine_id === selected.id,
  );
  const needsCompletion = selected.completion === true
    || (selected.completion === undefined
      && selectedProgramVersion.version === 1
      && !["mon", "thu", "sat"].includes(selected.id));

  function isRoutineCompleted(routine: Routine, workoutDate: string) {
    const completion = completionRecords.some(
      (record) => record.workout_date === workoutDate && record.routine_id === routine.id,
    );
    const programVersion = findProgramVersionForDate(programVersions, workoutDate) ?? DEFAULT_WORKOUT_PROGRAM_VERSION;
    if (routine.completion === true
      || (routine.completion === undefined && programVersion.version === 1 && !["mon", "thu", "sat"].includes(routine.id))) {
      return completion;
    }
    return [...pushRecords, ...pullRecords, ...recoveryPushRecords, ...sundayPullupRecords]
      .some((record) => record.workout_date === workoutDate) || completion;
  }

  async function loadRecords() {
    if (!supabase || !session) return;
    const userId = session.user.id;
    if (userId !== activeUserIdRef.current) return;
    const requestId = ++recordsRequestRef.current;
    setRecordsStatus("loading");
    const [sessionResult, completionResult] = await Promise.all([
      supabase
        .from("workout_session_history")
        .select("id, workout_date, workout_type, program_version_id, target_total, total_reps, set_count, set_reps, details, created_at, updated_at, event_order, is_current")
        .order("workout_date", { ascending: false })
        .order("event_order", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: false }),
      supabase
        .from("routine_completion_history")
        .select("id, workout_date, routine_id, program_version_id, details, completed_at, event_order, is_completed, is_current")
        .order("workout_date", { ascending: false })
        .order("event_order", { ascending: false, nullsFirst: false })
        .order("completed_at", { ascending: false })
        .order("id", { ascending: false }),
    ]);

    if (requestId !== recordsRequestRef.current || userId !== activeUserIdRef.current) return;

    if (!sessionResult.error) {
      const events = (sessionResult.data ?? []) as WorkoutSessionEvent[];
      const records = currentWorkoutSessions(events);
      setWorkoutHistory(events);
      setPushRecords(records.filter((record) => record.workout_type === "pushup"));
      setPullRecords(records.filter((record) => record.workout_type === "pullup"));
      setRecoveryPushRecords(records.filter((record) => record.workout_type === "recovery_pushup"));
      setSundayPullupRecords(records.filter((record) => record.workout_type === "sunday_pullup"));
    }
    if (!completionResult.error) {
      const events = (completionResult.data ?? []) as RoutineCompletionEvent[];
      setCompletionHistory(events);
      setCompletionRecords(currentRoutineCompletions(events));
    }
    setRecordsStatus(sessionResult.error || completionResult.error ? "error" : "ready");
    setRecordsRevision((revision) => revision + 1);
  }

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase
      .from("workout_program_versions")
      .select("id, program_key, version, effective_from, source_url, definition")
      .eq("program_key", DEFAULT_WORKOUT_PROGRAM_VERSION.program_key)
      .lte("effective_from", END_DATE)
      .order("effective_from", { ascending: false })
      .order("version", { ascending: false })
      .then(({ data, error }) => {
        const loaded = error
          ? []
          : (data ?? []).map(parseWorkoutProgramVersion).filter((version): version is WorkoutProgramVersion => version !== null);
        if (active && loaded.length > 0) setProgramVersions(loaded);
      });
    return () => { active = false; };
  }, [today]);

  useEffect(() => {
    if (!supabase) return;
    function updateSession(nextSession: Session | null) {
      const nextUserId = nextSession?.user.id ?? null;
      if (nextUserId !== activeUserIdRef.current) {
        recordsRequestRef.current += 1;
        activeUserIdRef.current = nextUserId;
        setPushRecords([]);
        setPullRecords([]);
        setRecoveryPushRecords([]);
        setSundayPullupRecords([]);
        setCompletionRecords([]);
        setWorkoutHistory([]);
        setCompletionHistory([]);
        setRecordsStatus(nextSession ? "loading" : "idle");
      }
      setSession(nextSession);
    }

    void supabase.auth.getSession().then(({ data }) => updateSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      updateSession(nextSession);
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
    <div className={`app-shell ${isGearSecondTheme ? "gear-second" : ""}`}>
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
              {session ? (isAdmin ? "관리자 로그인됨" : "기록 로그인됨") : "기록 미로그인"}
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
          <div className="hero-metrics">
            <section
              className={`mission-progress ${session && recordsStatus === "ready" ? "" : "muted"}`}
              aria-label="내 운동 진행률"
              aria-live="polite"
              aria-busy={session ? recordsStatus === "loading" || recordsStatus === "idle" : undefined}
            >
              {session && recordsStatus === "ready" ? (
                <>
                  <div className="mission-progress-summary">
                    <span>MY PROGRESS</span>
                    <strong>{completedDays}/{journeyDay} DAYS</strong>
                  </div>
                  <p id="mission-progress-copy">{completionRate}% 운동 완료</p>
                  <progress
                    aria-describedby="mission-progress-copy"
                    aria-label="90일 미션 운동 완료일"
                    max={journeyDay}
                    value={completedDays}
                  >
                    {completionRate}%
                  </progress>
                </>
              ) : (
                <>
                  <div className="mission-progress-summary">
                    <span>MY PROGRESS</span>
                    <strong>
                      {session
                        ? recordsStatus === "error" ? "기록을 불러오지 못했습니다" : "기록 불러오는 중"
                        : "로그인이 필요합니다"}
                    </strong>
                  </div>
                  <p>
                    {session && recordsStatus === "error"
                      ? "잠시 후 다시 확인해주세요."
                      : session ? "내 운동 기록을 확인하고 있습니다." : "로그인하면 기록 기반 진행률을 확인할 수 있습니다."}
                  </p>
                </>
              )}
            </section>
            <div className="hero-stats" aria-label="미션 현황">
              <div><span>NOW</span><strong>DAY {String(journeyDay).padStart(2, "0")}</strong></div>
              <div><span>CYCLE</span><strong>WEEK {week} / 13</strong></div>
              <div><span>GOAL</span><strong>풀업 15 · 푸쉬업 60</strong></div>
            </div>
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
        {isAdmin ? (
          <AdminMonthlyPanel programVersions={programVersions} />
        ) : session ? (
          <AdminMonthlyPanel
            mode="self"
            programVersions={programVersions}
            workoutRecords={[...pushRecords, ...pullRecords, ...recoveryPushRecords, ...sundayPullupRecords]}
            completionRecords={completionRecords}
            recordsStatus={recordsStatus}
            onRefresh={loadRecords}
          />
        ) : null}
        <section className="week-section" aria-labelledby="week-title">
          <div className="week-heading">
            <div>
              <p className="eyebrow dark">7-DAY WINDOW</p>
              <h2 id="week-title">오늘 전후 7일</h2>
            </div>
            <p>과거 3일 · 오늘 · 미래 3일</p>
          </div>

          <div ref={weekMapRef} className="week-map" id="weekly-map" aria-label="오늘 전후 7일 운동 선택">
            {visibleDays.map(({ date, workoutDate, routine }) => {
              const isToday = routine.id === todayId;
              const isSelected = routine.id === selectedId;
              const isCompleted = isRoutineCompleted(routine, workoutDate);

              return (
                <button
                  ref={isSelected ? selectedRef : undefined}
                  className={`day-button ${routine.status} ${isToday ? "today" : ""} ${isCompleted ? "done" : ""} ${isSelected ? "selected" : ""}`}
                  key={workoutDate}
                  onClick={() => setSelectedId(routine.id)}
                  aria-pressed={isSelected}
                  aria-label={`${routine.ko} ${date.getMonth() + 1}월 ${date.getDate()}일, ${routine.short}${isToday ? ", 오늘" : ""}`}
                  type="button"
                >
                  {isToday && <span className="today-badge">TODAY</span>}
                  <span className="day-label">{routine.day}</span>
                  <strong>{date.getDate()}</strong>
                  <small>{routine.short}</small>
                  <span className="day-state">
                    {isCompleted ? (
                      <><Check size={12} /> DONE</>
                    ) : routine.status === "ready" ? "FIXED" : "WAITING"}
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
              {isAdmin && (
                <AdminDailyPanel
                  workoutDate={selectedWorkoutDate}
                  routine={selected}
                  refreshToken={recordsRevision}
                />
              )}
            </div>
          ) : (
            <div className="detail-content">
              <p className="eyebrow dark">{selected.category}</p>
              <h2 id="selected-day-title">{selected.title}</h2>
              <p className="detail-summary">{selected.summary}</p>

              {selectedDay.programVersionMissing && (
                <p className="form-message" role="alert">이 기록의 프로그램 버전을 불러오지 못해 이 날짜 처방을 대신 표시합니다. 저장된 기록은 그대로 유지됩니다.</p>
              )}

              <div className="current-target">
                <span>CURRENT TARGET</span>
                <strong>{selected.target}</strong>
              </div>

              {selected.inputs && (
                <div className="current-target input-definition">
                  <span>INPUT DATA</span>
                  <strong>{selected.inputs}</strong>
                </div>
              )}

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

              {selected.id === selectedProgressions.pushup.routineId && !isAdmin && (
                <WorkoutResultForm
                  key={`pushup-${selectedWorkoutDate}`}
                  workoutType="pushup"
                  session={session}
                  records={pushRecords}
                  programVersions={programVersions}
                  defaultDate={selectedWorkoutDate}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === selectedProgressions.recovery_pushup.routineId && !isAdmin && (
                <FiveSetProgressForm
                  key={`recovery-pushup-${selectedWorkoutDate}`}
                  workoutType="recovery_pushup"
                  session={session}
                  records={recoveryPushRecords}
                  programVersions={programVersions}
                  defaultDate={selectedWorkoutDate}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === selectedProgressions.sunday_pullup.routineId && !isAdmin && (
                <FiveSetProgressForm
                  key={`sunday-pullup-${selectedWorkoutDate}`}
                  workoutType="sunday_pullup"
                  session={session}
                  records={sundayPullupRecords}
                  programVersions={programVersions}
                  defaultDate={selectedWorkoutDate}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === selectedProgressions.pullup.routineId && !isAdmin && (
                <WorkoutResultForm
                  key={`pullup-${selectedWorkoutDate}`}
                  workoutType="pullup"
                  session={session}
                  records={pullRecords}
                  programVersions={programVersions}
                  defaultDate={selectedWorkoutDate}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {needsCompletion && !isAdmin && (
                <RoutineCompletionPanel
                  routine={selected}
                  workoutDate={selectedWorkoutDate}
                  session={session}
                  completionRecord={selectedCompletionRecord}
                  programVersionId={programVersionId}
                  onChanged={loadRecords}
                />
              )}
              {session && !isAdmin && (
                <UserRoutineHistory
                  routine={selected}
                  programVersions={programVersions}
                  workoutRecords={
                    selected.id === selectedProgressions.recovery_pushup.routineId
                      ? workoutHistory.filter((record) => record.workout_type === "recovery_pushup")
                      : selected.id === selectedProgressions.pushup.routineId
                        ? workoutHistory.filter((record) => record.workout_type === "pushup")
                        : selected.id === selectedProgressions.pullup.routineId
                          ? workoutHistory.filter((record) => record.workout_type === "pullup")
                          : selected.id === selectedProgressions.sunday_pullup.routineId
                            ? workoutHistory.filter((record) => record.workout_type === "sunday_pullup")
                            : []
                  }
                  completionRecords={completionHistory}
                />
              )}
              {isAdmin && (
                <AdminDailyPanel
                  workoutDate={selectedWorkoutDate}
                  routine={selected}
                  refreshToken={recordsRevision}
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
    </div>
  );
}

export default App;
