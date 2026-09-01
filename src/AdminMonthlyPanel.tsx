import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, ShieldCheck, Users } from "lucide-react";
import {
  buildMonthCells,
  recordOutcome,
  recordState,
  routineIdForDate,
  seoulMonthValue,
  shiftMonth,
} from "./adminCalendar";
import {
  findProgramVersionForDate,
  type WorkoutProgramVersion,
} from "./program";
import { supabase } from "./supabase";

type AdminMonthlyRecord = {
  user_id: string;
  user_email: string | null;
  workout_date: string | null;
  record_kind: "workout_session" | "routine_completion" | null;
  routine_id: string | null;
  workout_type: "pushup" | "pullup" | "recovery_pushup" | "sunday_pullup" | null;
  program_version_id: string | null;
  target_total: number | null;
  total_reps: number | null;
  set_count: number | null;
  set_reps: number[] | null;
  recorded_at: string | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return `${year}년 ${month}월`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function formatRecordedAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function recordSummary(record: AdminMonthlyRecord) {
  if (record.record_kind === "routine_completion") {
    return record.routine_id === "tue" ? "휴식 완료 체크" : "루틴 완료 체크";
  }
  if (record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup") {
    return `${record.set_reps?.join(" · ") ?? "-"}회 / 목표 ${record.target_total}회 × 5세트`;
  }
  if (record.workout_type === "pullup") {
    return `목표 ${record.target_total}회 · ${record.set_count ?? "-"}세트`;
  }
  return `${record.total_reps ?? "-"} / ${record.target_total ?? "-"}회`;
}

function recordLabel(record: AdminMonthlyRecord) {
  if (record.record_kind === "routine_completion") return "완료 체크";
  if (record.workout_type === "recovery_pushup") return "리커버리 푸쉬업 결과";
  if (record.workout_type === "sunday_pullup") return "일요일 맨몸 풀업 결과";
  if (record.workout_type === "pullup") return "풀업 결과";
  return "푸쉬업 결과";
}

function outcomeNote(record: AdminMonthlyRecord & { workout_date: string }, outcome: ReturnType<typeof recordOutcome>) {
  if (!record.program_version_id && !outcome.programVersion) {
    return "기록 당시 프로그램 버전이 없어 PR을 판정하지 않고 수행 완료로 표시합니다.";
  }
  if (!outcome.programVersion) {
    return "저장된 프로그램 버전을 확인할 수 없어 PR을 판정하지 않고 수행 완료로 표시합니다.";
  }
  if (record.record_kind === "routine_completion") {
    return "완료 체크는 PR 판정 없이 수행 완료로 표시합니다.";
  }
  if (!record.workout_type || record.target_total === null) {
    return "PR 판정에 필요한 결과가 없어 수행 완료로 표시합니다.";
  }

  const rule = outcome.programVersion.definition.progressions[record.workout_type];
  const condition = record.workout_type === "recovery_pushup"
    ? `5세트 모두 ${record.target_total}회 이상`
    : record.workout_type === "sunday_pullup"
      ? `맨몸 5세트 모두 ${record.target_total}회 이상`
      : record.workout_type === "pullup"
        ? `총 ${record.target_total}회 완료 및 ${rule.successSetCount}세트 이내`
        : `5세트 합계 ${record.target_total}회 이상`;
  return `프로그램 v${outcome.programVersion.version} 기준은 ${condition}입니다. ${outcome.state === "pr"
    ? `조건을 충족해 다음 목표가 ${rule.increment}회 증가합니다.`
    : "조건을 충족하지 않아 다음 목표를 유지합니다."}`;
}

export function AdminMonthlyPanel({ programVersions }: { programVersions: WorkoutProgramVersion[] }) {
  const initialMonth = seoulMonthValue();
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(`${initialMonth}-01`);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [records, setRecords] = useState<AdminMonthlyRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadMonth() {
      if (!supabase) return;
      setStatus("loading");
      setMessage("");
      const { data, error } = await supabase.rpc("get_admin_monthly_records", {
        target_month: `${month}-01`,
      });
      if (!active) return;
      if (error) {
        setRecords([]);
        setStatus("error");
        setMessage(`월간 기록을 불러오지 못했습니다: ${error.message}`);
      } else {
        setRecords((data ?? []) as AdminMonthlyRecord[]);
        setStatus("ready");
      }
    }

    void loadMonth();
    return () => { active = false; };
  }, [month, refreshToken]);

  const users = useMemo(() => {
    const uniqueUsers = new Map<string, string>();
    for (const record of records) {
      uniqueUsers.set(record.user_id, record.user_email ?? "이메일 없는 사용자");
    }
    return [...uniqueUsers].map(([id, email]) => ({ id, email }));
  }, [records]);

  useEffect(() => {
    if (!users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(users[0]?.id ?? "");
    }
  }, [selectedUserId, users]);

  const userRecords = useMemo(
    () => records.filter(
      (record): record is AdminMonthlyRecord & { workout_date: string; record_kind: "workout_session" | "routine_completion" } =>
        record.user_id === selectedUserId && record.workout_date !== null && record.record_kind !== null,
    ),
    [records, selectedUserId],
  );
  const recordsByDate = useMemo(() => {
    const grouped = new Map<string, typeof userRecords>();
    for (const record of userRecords) {
      grouped.set(record.workout_date, [...(grouped.get(record.workout_date) ?? []), record]);
    }
    return grouped;
  }, [userRecords]);
  const selectedRecords = recordsByDate.get(selectedDate) ?? [];
  const selectedState = recordState(selectedRecords, programVersions);
  const routineForDate = (date: string) => findProgramVersionForDate(programVersions, date)
    ?.definition.days.find((routine) => routine.id === routineIdForDate(date));
  const selectedRoutine = routineForDate(selectedDate);
  const selectedUser = users.find((user) => user.id === selectedUserId);

  function changeMonth(nextMonth: string) {
    if (!nextMonth) return;
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
  }

  return (
    <section className="admin-panel admin-calendar-panel" aria-labelledby="admin-calendar-title" aria-busy={status === "loading"}>
      <div className="admin-heading">
        <div className="admin-title">
          <span className="admin-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div>
            <p className="eyebrow dark">ADMIN MONTHLY VIEW</p>
            <h2 id="admin-calendar-title">사용자별 운동 달력</h2>
          </div>
        </div>
        <button
          type="button"
          className="admin-refresh"
          onClick={() => setRefreshToken((token) => token + 1)}
          disabled={status === "loading"}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {status === "loading" ? "확인 중" : "새로고침"}
        </button>
      </div>

      <div className="admin-calendar-controls">
        <label>
          <span><Users size={14} aria-hidden="true" /> 가입 사용자</span>
          <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={status !== "ready" || users.length === 0}>
            {users.length === 0 && <option value="">사용자 없음</option>}
            {users.map((user) => <option key={user.id} value={user.id}>{user.email}</option>)}
          </select>
        </label>
        <div className="admin-month-control">
          <button type="button" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="이전 달">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <label>
            <span>조회 연·월</span>
            <input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} />
          </label>
          <button type="button" onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="다음 달">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {status === "error" && <p className="admin-calendar-message" role="alert">{message}</p>}
      {status === "loading" && <p className="admin-calendar-message" role="status">{formatMonth(month)} 기록을 불러오는 중입니다.</p>}
      {status === "ready" && users.length === 0 && (
        <div className="admin-empty">
          <strong>가입 사용자가 없습니다.</strong>
          <span>사용자가 가입하면 이곳에서 월간 기록을 확인할 수 있습니다.</span>
        </div>
      )}

      {status === "ready" && users.length > 0 && (
        <div className="admin-calendar-layout">
          <div>
            <div className="admin-calendar-heading">
              <strong>{formatMonth(month)}</strong>
              <span>{selectedUser?.email} · 기록 {userRecords.length}건</span>
            </div>
            <div className="admin-calendar-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="admin-calendar-grid" aria-label={`${selectedUser?.email} ${formatMonth(month)} 운동 기록 날짜`}>
              {buildMonthCells(month).map((cell, index) => {
                if (!cell) return <span className="admin-calendar-blank" key={`blank-${index}`} aria-hidden="true" />;
                const dayRecords = recordsByDate.get(cell.date) ?? [];
                const state = recordState(dayRecords, programVersions);
                const routine = routineForDate(cell.date);
                const stateLabel = state === "pr" ? "PR 달성" : state === "performed" ? "수행 완료" : "저장 기록 없음";
                const marker = state === "pr" ? "👑" : "✓";
                return (
                  <button
                    type="button"
                    key={cell.date}
                    className={`admin-calendar-day ${state} ${cell.date === selectedDate ? "selected" : ""}`}
                    onClick={() => setSelectedDate(cell.date)}
                    aria-pressed={cell.date === selectedDate}
                    aria-label={`${formatDate(cell.date)}, ${routine?.title ?? routine?.ko ?? "예정 루틴"}, ${stateLabel}`}
                  >
                    <span>{cell.day}</span>
                    {state !== "none" && <i aria-hidden="true">{marker}</i>}
                  </button>
                );
              })}
            </div>
            <div className="admin-calendar-legend" aria-label="달력 기록 상태 범례">
              <span><i className="performed" aria-hidden="true">✓</i> 수행 완료</span>
              <span><i className="pr" aria-hidden="true">👑</i> PR 달성</span>
            </div>
          </div>

          <section className="admin-calendar-detail" aria-labelledby="admin-calendar-detail-title" aria-live="polite">
            <p className="eyebrow dark">SELECTED DAY</p>
            <h3 id="admin-calendar-detail-title">{formatDate(selectedDate)}</h3>
            <div className="admin-calendar-routine">
              <span>예정 루틴 · {selectedRoutine?.ko}</span>
              <strong>{selectedRoutine?.title ?? "등록된 루틴 없음"}</strong>
            </div>
            {selectedState !== "none" && (
              <p className={`admin-calendar-detail-status ${selectedState}`}>
                {selectedState === "pr" ? "👑 PR 달성" : "수행 완료"}
              </p>
            )}
            {selectedRecords.length === 0 ? (
              <div className="admin-empty">
                <strong>저장된 결과나 완료 체크가 없습니다.</strong>
                <span>예정 루틴만 확인할 수 있습니다.</span>
              </div>
            ) : (
              <div className="admin-calendar-records">
                {selectedRecords.map((record) => {
                  const outcome = recordOutcome(record, programVersions);
                  const programLabel = outcome.programVersion
                    ? `프로그램 v${outcome.programVersion.version}`
                    : record.program_version_id ? "프로그램 버전 확인 필요" : "프로그램 버전 없음";
                  return (
                    <article className={outcome.state} key={`${record.record_kind}-${record.recorded_at}`}>
                      <span>{outcome.state === "pr" ? "👑 PR 달성" : "수행 완료"} · {recordLabel(record)}</span>
                      <strong>{recordSummary(record)}</strong>
                      <small>{record.recorded_at ? `${formatRecordedAt(record.recorded_at)} 저장 · ${programLabel}` : programLabel}</small>
                      <small>{outcomeNote(record, outcome)}</small>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      <p className="admin-note">등록된 관리자만 조회할 수 있는 읽기 전용 화면입니다. 다른 사용자의 기록은 수정할 수 없습니다.</p>
    </section>
  );
}
