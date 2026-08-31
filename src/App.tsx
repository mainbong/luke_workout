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
import { fiveSetSucceeded, nextFiveSetTarget } from "./progression";
import {
  isSupabaseConfigured,
  supabase,
  type AdminRoutineHistoryRecord,
  type RoutineCompletion,
  type WorkoutSession,
} from "./supabase";

const START_DATE = new Date("2026-07-23T00:00:00+09:00");
const END_DATE = "2026-10-20";
const TOTAL_DAYS = 90;
const PUSH_START_TARGET = 100;
const PULL_START_TARGET = 30;
const RECOVERY_PUSH_START_TARGET = 15;
const SUNDAY_PULLUP_START_TARGET = 3;
const ADMIN_EMAIL = "mainbbong@gmail.com";

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
  recoveryPushTarget: number,
  sundayPullupTarget: number,
  week: number,
  latestPushRecord?: WorkoutSession,
  latestPullRecord?: WorkoutSession,
  latestRecoveryPushRecord?: WorkoutSession,
  latestSundayPullupRecord?: WorkoutSession,
): Routine[] {
  return [
    {
      id: "mon",
      day: "MON",
      ko: "월요일",
      status: "ready",
      short: `푸쉬업 ${recoveryPushTarget}×5`,
      category: "PUSH RECOVERY",
      title: "리커버리 푸쉬업",
      summary: `${recoveryPushTarget}회를 한 세트로 끝까지 연결하되, 자세를 지키며 회복성 볼륨을 쌓습니다.`,
      target: `오늘 목표 · ${recoveryPushTarget}회 × 5세트`,
      record: latestRecoveryPushRecord
        ? `${formatWorkoutDate(latestRecoveryPushRecord.workout_date)} 최근 기록 · ${latestRecoveryPushRecord.set_reps?.join(" · ")}회`
        : undefined,
      exercises: [
        {
          name: "리커버리 푸쉬업",
          prescription: `${recoveryPushTarget}회 × 5세트`,
          note: `${recoveryPushTarget}회를 최대한 언브로큰으로 진행합니다. 멈추더라도 3초 안에 다시 시작하고, 3초마다 1회씩 하더라도 정자세 푸쉬업으로 ${recoveryPushTarget}회를 모두 마친 뒤에 쉽니다. 인클라인·무릎 푸쉬업은 허용하지 않습니다.`,
        },
        {
          name: "세트 간 휴식",
          prescription: "1분 30초 ~ 2분 30초",
          note: "호흡과 자세가 회복되면 범위 안에서 다음 세트를 시작합니다.",
        },
      ],
    },
    {
      id: "tue",
      day: "TUE",
      ko: "화요일",
      status: "ready",
      short: "완전 휴식",
      category: "REST DAY",
      title: "완전 휴식",
      summary: "별도 운동을 진행하지 않고 다음 훈련을 위해 회복합니다.",
      target: "오늘 목표 · 운동 없음",
      exercises: [
        {
          name: "휴식",
          prescription: "운동 없음",
          note: "정해진 운동 루틴 없이 쉽니다. 피로감이나 통증이 남아 있다면 회복을 우선합니다.",
        },
      ],
    },
    {
      id: "wed",
      day: "WED",
      ko: "수요일",
      status: "ready",
      short: "팔 + 로우 + 러닝",
      category: "ARMS + ROW",
      title: "팔 루틴 + 원암 덤벨로우",
      summary: "팔 3종은 다음 날 푸쉬업 미션을 고려해 여유를 남기고, 원암 덤벨로우는 RPE 8 기준으로 진행합니다.",
      target: "오늘 목표 · 상체 4종 + 러닝머신 10분",
      exercises: [
        {
          name: "덤벨 숄더프레스",
          prescription: "10회 × 3세트",
          note: "첫 세트가 RPE 7~8인 무게를 정해 3세트 동안 유지합니다. 10회에 실패하면 다음 세트부터 감량해 10회를 채우고, 허리가 뜨거나 팔의 좌우 균형이 무너지면 즉시 종료합니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 핵심 4포인트",
              url: "https://www.youtube.com/shorts/QqhMqG8YO2k",
            },
            {
              label: "한국어 상세 · 완전 기초 2분",
              url: "https://www.youtube.com/watch?v=OMCJoZfKhxM",
            },
            {
              label: "ACE · 자세 참고",
              url: "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/",
            },
          ],
        },
        {
          name: "덤벨컬",
          prescription: "10회 × 3세트",
          note: "첫 10회가 RPE 7~8인 무게로 3세트를 진행합니다. 반동 없이 팔꿈치 위치와 손목을 유지하고, 10회에 실패하면 감량해 남은 세트의 10회를 채웁니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 덤벨컬 방법",
              url: "https://www.youtube.com/shorts/M3kVtY-oLsk",
            },
            {
              label: "한국어 상세 · 고립과 기본 자세",
              url: "https://www.youtube.com/watch?v=z3w1txqnGBs",
            },
            {
              label: "ACE · 자세 참고",
              url: "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/",
            },
          ],
        },
        {
          name: "덤벨 오버헤드 트라이셉스 익스텐션",
          prescription: "12회 × 3세트",
          note: "덤벨 하나를 양손으로 잡습니다. 첫 12회가 RPE 7~8인 무게를 유지하고, 실패하면 감량해 12회를 채웁니다. 팔꿈치는 정면과 어깨너비를 유지하며 머리나 목에 닿지 않게 천천히 내립니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 정석 자세",
              url: "https://www.youtube.com/shorts/V8YlItAMIsU",
            },
            {
              label: "한국어 상세 · 덤벨 오버헤드 삼두",
              url: "https://www.youtube.com/watch?v=hzMKVpTK1GI",
            },
            {
              label: "ACE · 자세 참고",
              url: "https://www.acefitness.org/resources/everyone/exercise-library/74/triceps-extension/",
            },
          ],
        },
        {
          name: "원암 덤벨로우",
          prescription: "한쪽 15회 × 5세트",
          note: "벤치에 반대쪽 손과 무릎을 지지합니다. 첫 15회가 RPE 8인 무게로 시작해 가능한 가장 작은 단위로 증량합니다. 15회에 실패하면 증량을 멈추고 남은 세트는 같은 무게로 자세를 유지할 수 있는 최대 횟수까지 진행합니다. 양쪽을 마쳐야 1세트입니다.",
          guides: [
            {
              label: "한국어 쇼츠 · 정자세",
              url: "https://www.youtube.com/shorts/j1EyGHSSw-0",
            },
            {
              label: "한국어 상세 · 벤치 활용 기초",
              url: "https://www.youtube.com/watch?v=5y2LKebrvAk",
            },
            {
              label: "ACE · 자세 참고",
              url: "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/",
            },
          ],
        },
        {
          name: "세트 간 휴식",
          prescription: "1분 30초 ~ 2분",
          note: "원암 덤벨로우는 양쪽을 모두 마친 뒤 휴식합니다.",
        },
        {
          name: "러닝머신",
          prescription: "속도 7 · 10분",
          note: "웨이트 루틴을 모두 마친 뒤 진행합니다.",
        },
      ],
    },
    {
      id: "thu",
      day: "THU",
      ko: "목요일",
      status: "ready",
      short: `푸쉬업 ${pushTarget}`,
      category: "WEIGHT PUSH",
      title: "푸쉬업 맥스 미션",
      summary: "정자세로 가능한 최대 반복을 5세트 수행하고, 세트 합계로 이번 미션의 성공 여부를 판정합니다.",
      target: `현재 목표 · 5세트 합계 ${pushTarget}회`,
      record: latestPushRecord
        ? `${formatWorkoutDate(latestPushRecord.workout_date)} 최근 기록 · ${latestPushRecord.total_reps} / ${latestPushRecord.target_total}회`
        : undefined,
      exercises: [
        {
          name: "1. 세트 수행",
          prescription: "최대 5세트",
          note: "각 세트는 정자세를 유지할 수 있는 실패 직전까지 수행합니다. 허리가 꺾이거나 몸통이 무너지는 등 자세가 흐트러지기 시작하면 억지로 반복하지 않고 그 세트를 종료합니다.",
        },
        {
          name: "2. 세트 사이",
          prescription: "1분 30초",
          note: "세트가 끝나면 정확히 1분 30초를 쉬고 다음 세트에 들어갑니다. 같은 방식으로 최대 5세트까지만 진행합니다.",
        },
        {
          name: "3. 오늘의 성공 판정",
          prescription: `5세트 합계 ${pushTarget}회`,
          note: `5세트에서 수행한 횟수를 모두 더합니다. 합계가 ${pushTarget}회 이상이면 성공이고, 미만이면 실패입니다. 결과 입력에는 5세트 합계만 기록합니다.`,
        },
        {
          name: "4. 다음 푸쉬업 데이",
          prescription: "성공 +10회 · 실패 유지",
          note: `성공하면 다음 목요일의 5세트 합계 목표가 ${pushTarget + 10}회로 올라갑니다. 실패하면 다음 목요일에도 ${pushTarget}회에 다시 도전합니다. 목표 계산은 로그인한 사용자 자신의 기록만 사용합니다.`,
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
      summary: "한 세트의 횟수는 자유롭게 끊되, 오늘의 목표 총량을 모두 채울 때까지 반복합니다.",
      target: `현재 목표 · 풀업 총 ${pullTarget}회`,
      record: latestPullRecord
        ? `${formatWorkoutDate(latestPullRecord.workout_date)} 최근 기록 · ${latestPullRecord.total_reps} / ${latestPullRecord.target_total}회 · ${latestPullRecord.set_count}세트`
        : undefined,
      exercises: [
        {
          name: "1. 오늘의 종료 조건",
          prescription: `총 ${pullTarget}회 · 완료할 때까지`,
          note: `하루의 정해진 총 ${pullTarget}회를 모두 채우면 풀업 미션을 종료합니다. '최대 10세트'가 아니므로 10세트를 넘겨도 목표 횟수를 성공할 때까지 계속합니다.`,
        },
        {
          name: "2. 세트 수행과 휴식",
          prescription: "철봉에서 내려오면 1분 30초",
          note: "한 세트에 몇 개씩 끊어가는지는 자유입니다. 철봉에서 내려오는 순간 한 세트가 끝나며, 1분 30초를 쉰 뒤 바로 다음 세트에 들어갑니다.",
        },
        {
          name: "3. 성공 판정 예시",
          prescription: "30회 · 10세트 이내 성공",
          note: "예: 5, 5, 3, 3, 3, 3, 2, 2, 2, 2회 = 총 30회, 10세트. 10세트 안에 목표를 채웠으므로 다음 풀업 데이 목표는 40회입니다.",
        },
        {
          name: "4. 다음 풀업 데이",
          prescription: "10세트 이내 +10회 · 11세트 이상 유지",
          note: `총 ${pullTarget}회를 10세트 이내에 마치면 다음 풀업 데이 목표가 ${pullTarget + 10}회로 올라갑니다. 11세트 이상 걸렸다면 목표를 완수했더라도 다음 풀업 데이에 같은 ${pullTarget}회로 다시 도전합니다. 완료에 사용한 전체 세트 수를 반드시 기록합니다.`,
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
      short: `등 볼륨 · 풀업 ${sundayPullupTarget}×5`,
      category: "BACK VOLUME",
      title: "등 볼륨 루틴 + 러닝머신",
      summary: "반복 수와 자세를 우선하며, 정한 규칙에 따라 보조·증량·감량을 적용합니다.",
      target: `오늘 목표 · 풀업 ${sundayPullupTarget}회 × 5세트 + 등 운동 3종 + 러닝머신 10분`,
      record: latestSundayPullupRecord
        ? `${formatWorkoutDate(latestSundayPullupRecord.workout_date)} 최근 맨몸 풀업 · ${latestSundayPullupRecord.set_reps?.join(" · ")}회`
        : undefined,
      exercises: [
        {
          name: "풀업",
          prescription: `${sundayPullupTarget}회 × 5세트`,
          note: `각 세트는 맨몸으로 ${sundayPullupTarget}회에 도전합니다. 실패하면 풀업머신으로 전환해 해당 세트의 ${sundayPullupTarget}회를 채웁니다. 5세트 모두 맨몸으로 성공하면 다음 일요일부터 세트당 1회 증가하고, 한 세트라도 머신 보조를 쓰면 목표를 유지합니다.`,
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

function FiveSetProgressForm({
  workoutType,
  session,
  records,
  currentTarget,
  defaultDate,
  onSaved,
}: {
  workoutType: "recovery_pushup" | "sunday_pullup";
  session: Session | null;
  records: WorkoutSession[];
  currentTarget: number;
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

    const target = savedRecord?.target_total ?? currentTarget;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("workout_sessions").upsert(
      {
        user_id: session.user.id,
        workout_date: workoutDate,
        workout_type: workoutType,
        target_total: target,
        total_reps: reps.reduce((sum, value) => sum + value, 0),
        set_count: 5,
        set_reps: reps,
      },
      { onConflict: "user_id,workout_date,workout_type" },
    );

    if (error) {
      setMessage(`저장하지 못했습니다: ${error.message}`);
    } else {
      await onSaved();
      const succeeded = reps.every((value) => value >= target);
      setMessage(`저장 완료 · 다음 목표 ${succeeded ? target + 1 : target}회 × 5세트`);
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
          <p>{isSundayPullup ? "각 세트에서 머신 도움 없이 성공한 맨몸 횟수만 입력하세요. " : ""}5세트 모두 이번 목표 이상이면 다음 {dayName}부터 세트당 1회가 올라갑니다.</p>
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
      <p className="rule-preview">
        이번 목표 <strong>{savedRecord?.target_total ?? currentTarget}회 × 5</strong>
        <span aria-hidden="true">→</span>
        5세트 모두 성공 <strong>세트당 +1</strong> · 실패 <strong>유지</strong>
      </p>
      {message && <p className="form-message" role="status">{message}</p>}
    </section>
  );
}

function UserRoutineHistory({
  routine,
  workoutRecords,
  completionRecords,
}: {
  routine: Routine;
  workoutRecords: WorkoutSession[];
  completionRecords: RoutineCompletion[];
}) {
  const isNumeric = routine.id === "mon" || routine.id === "thu" || routine.id === "sat";
  const completions = completionRecords.filter((record) => record.routine_id === routine.id);
  const records = routine.id === "sun"
    ? [...workoutRecords, ...completions].sort((a, b) => b.workout_date.localeCompare(a.workout_date))
    : isNumeric ? workoutRecords : completions;

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
              const isFiveSet = record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup";
              const succeeded = isFiveSet
                ? fiveSetSucceeded(record)
                : record.workout_type === "pullup"
                  ? record.set_count !== null && record.set_count <= 10
                  : record.total_reps >= record.target_total;
              const result = isFiveSet
                ? `${record.set_reps?.join(" · ")}회 / 목표 ${record.target_total}×5`
                : record.workout_type === "pullup"
                  ? `목표 ${record.target_total}회 · ${record.set_count}세트`
                  : `${record.total_reps} / ${record.target_total}회`;
              return (
                <article key={record.id}>
                  <div><strong>{formatWorkoutDate(record.workout_date)}</strong><small>WEEK {getJourneyWeekFromValue(record.workout_date)}</small></div>
                  <span>{result}</span>
                  <em className={succeeded ? "success" : "keep"}>{succeeded ? "다음 목표 증가" : "목표 유지"}</em>
                </article>
              );
            }
            return (
              <article key={record.id}>
                <div><strong>{formatWorkoutDate(record.workout_date)}</strong><small>WEEK {getJourneyWeekFromValue(record.workout_date)}</small></div>
                <span>{routine.id === "tue" ? "휴식 완료" : "루틴 완료"}</span>
                <em className="success">DONE</em>
              </article>
            );
          })}
        </div>
      )}
      <p className="history-note">같은 날짜를 다시 저장하면 수정되고, 다음 주 기록은 새 항목으로 계속 쌓입니다.</p>
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
  const dailyRecords = records.filter((record) => record.workout_date === workoutDate);

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
        <small>{routine.ko} 누적 {records.length}회</small>
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
            const succeeded = isFiveSet
              ? record.set_reps?.length === 5
                && record.target_total !== null
                && record.set_reps.every((reps) => reps >= record.target_total!)
              : record.workout_type === "pullup"
                ? record.set_count !== null && record.set_count <= 10
                : record.total_reps !== null
                  && record.target_total !== null
                  && record.total_reps >= record.target_total;

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
                        ? `${record.target_total}회 · ${record.set_count}세트`
                        : `${record.total_reps} / ${record.target_total}회`}
                    </strong>
                    <em className={succeeded ? "success" : "keep"}>
                      {succeeded
                        ? isFiveSet ? "다음 목표 +1/세트" : "다음 목표 +10"
                        : "목표 유지"}
                    </em>
                  </div>
                ) : (
                  <div className="admin-result">
                    <span>완료 체크</span>
                    <strong>{record.routine_id === routine.id ? "이 루틴 완료" : `${record.routine_id} 완료`}</strong>
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
          <span>사용자가 이 요일의 결과나 완료 상태를 저장하면 주차별로 쌓입니다.</span>
        </div>
      ) : (
        <div className="admin-records admin-history-records" aria-label={`${routine.ko} 전체 주차 기록`}>
          {records.map((record) => {
            const isFiveSet = record.workout_type === "recovery_pushup" || record.workout_type === "sunday_pullup";
            const succeeded = isFiveSet
              ? record.set_reps?.length === 5
                && record.target_total !== null
                && record.set_reps.every((reps) => reps >= record.target_total!)
              : record.workout_type === "pullup"
                ? record.set_count !== null && record.set_count <= 10
                : record.workout_type === "pushup"
                  ? record.total_reps !== null
                    && record.target_total !== null
                    && record.total_reps >= record.target_total
                  : true;
            const result = isFiveSet
              ? `${record.set_reps?.join(" · ")}회 / 목표 ${record.target_total}×5`
              : record.workout_type === "pullup"
                ? `목표 ${record.target_total}회 · ${record.set_count}세트`
                : record.workout_type === "pushup"
                  ? `${record.total_reps} / ${record.target_total}회`
                  : record.routine_id === "tue" ? "휴식 완료" : "루틴 완료";

            return (
              <article key={`history-${record.record_kind}-${record.user_id}-${record.workout_date}`}>
                <div className="admin-user">
                  <span>{record.user_email}</span>
                  <small>{formatWorkoutDate(record.workout_date)} · WEEK {getJourneyWeekFromValue(record.workout_date)} · {formatRecordedAt(record.recorded_at)}</small>
                </div>
                <div className="admin-result">
                  <span>{record.record_kind === "workout_session" ? "결과" : "완료 체크"}</span>
                  <strong>{result}</strong>
                  <em className={succeeded ? "success" : "keep"}>
                    {record.record_kind === "routine_completion" ? "DONE" : succeeded ? "성공" : "목표 유지"}
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
  const [session, setSession] = useState<Session | null>(null);
  const [authNotice, setAuthNotice] = useState("");
  const [pushRecords, setPushRecords] = useState<WorkoutSession[]>([]);
  const [pullRecords, setPullRecords] = useState<WorkoutSession[]>([]);
  const [recoveryPushRecords, setRecoveryPushRecords] = useState<WorkoutSession[]>([]);
  const [sundayPullupRecords, setSundayPullupRecords] = useState<WorkoutSession[]>([]);
  const [completionRecords, setCompletionRecords] = useState<RoutineCompletion[]>([]);
  const [recordsRevision, setRecordsRevision] = useState(0);
  const isAdmin = session?.user.email?.toLowerCase() === ADMIN_EMAIL;
  const todayId = getTodayRoutineId(today);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const weekMapRef = useRef<HTMLDivElement>(null);
  const journeyDay = getJourneyDay(today);
  const week = getJourneyWeek(today);
  const pushTarget = nextPushTarget(pushRecords);
  const pullTarget = nextPullTarget(pullRecords);
  const recoveryPushTarget = nextFiveSetTarget(recoveryPushRecords, RECOVERY_PUSH_START_TARGET);
  const sundayPullupTarget = nextFiveSetTarget(sundayPullupRecords, SUNDAY_PULLUP_START_TARGET);
  const visibleDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => {
      const date = addDays(today, index - 3);
      const workoutDate = toDateInputValue(date);
      const routineId = getTodayRoutineId(date);
      const pushRecord = pushRecords.find((record) => record.workout_date === workoutDate);
      const pullRecord = pullRecords.find((record) => record.workout_date === workoutDate);
      const recoveryPushRecord = recoveryPushRecords.find((record) => record.workout_date === workoutDate);
      const sundayPullupRecord = sundayPullupRecords.find((record) => record.workout_date === workoutDate);
      const datePushTarget = pushRecord?.target_total ?? pushTarget;
      const datePullTarget = pullRecord?.target_total ?? pullTarget;
      const dateRecoveryPushTarget = recoveryPushRecord?.target_total ?? recoveryPushTarget;
      const dateSundayPullupTarget = sundayPullupRecord?.target_total ?? sundayPullupTarget;
      const routine = buildRoutines(
        datePushTarget,
        datePullTarget,
        dateRecoveryPushTarget,
        dateSundayPullupTarget,
        getJourneyWeek(date),
        pushRecord,
        pullRecord,
        recoveryPushRecord,
        sundayPullupRecord,
      ).find((item) => item.id === routineId);

      if (!routine) throw new Error(`Missing routine for ${routineId}`);
      return { date, workoutDate, routine };
    }),
    [pullRecords, pullTarget, pushRecords, pushTarget, recoveryPushRecords, recoveryPushTarget, sundayPullupRecords, sundayPullupTarget, today],
  );
  const selectedDay = visibleDays.find(({ routine }) => routine.id === selectedId) ?? visibleDays[3];
  const selected = selectedDay.routine;
  const selectedWorkoutDate = selectedDay.workoutDate;

  function isRoutineCompleted(routine: Routine, workoutDate: string) {
    if (routine.id === "mon") {
      return recoveryPushRecords.some((record) => record.workout_date === workoutDate);
    }
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
        .select("id, workout_date, workout_type, target_total, total_reps, set_count, set_reps, created_at")
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
      setRecoveryPushRecords(records.filter((record) => record.workout_type === "recovery_pushup"));
      setSundayPullupRecords(records.filter((record) => record.workout_type === "sunday_pullup"));
    }
    if (!completionResult.error) {
      setCompletionRecords((completionResult.data ?? []) as RoutineCompletion[]);
    }
    setRecordsRevision((revision) => revision + 1);
  }

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setPushRecords([]);
        setPullRecords([]);
        setRecoveryPushRecords([]);
        setSundayPullupRecords([]);
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

              {selected.id === "thu" && !isAdmin && (
                <WorkoutResultForm
                  workoutType="pushup"
                  session={session}
                  records={pushRecords}
                  currentTarget={pushTarget}
                  defaultDate={selectedWorkoutDate}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === "mon" && !isAdmin && (
                <FiveSetProgressForm
                  workoutType="recovery_pushup"
                  session={session}
                  records={recoveryPushRecords}
                  currentTarget={recoveryPushTarget}
                  defaultDate={selectedWorkoutDate}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === "sun" && !isAdmin && (
                <FiveSetProgressForm
                  workoutType="sunday_pullup"
                  session={session}
                  records={sundayPullupRecords}
                  currentTarget={sundayPullupTarget}
                  defaultDate={selectedWorkoutDate}
                  onSaved={loadRecords}
                />
              )}
              {selected.id === "sat" && !isAdmin && (
                <WorkoutResultForm
                  workoutType="pullup"
                  session={session}
                  records={pullRecords}
                  currentTarget={pullTarget}
                  defaultDate={selectedWorkoutDate}
                  initialMessage={authNotice}
                  onSaved={loadRecords}
                />
              )}
              {selected.id !== "mon" && selected.id !== "thu" && selected.id !== "sat" && !isAdmin && (
                <RoutineCompletionPanel
                  routine={selected}
                  workoutDate={selectedWorkoutDate}
                  session={session}
                  completed={isRoutineCompleted(selected, selectedWorkoutDate)}
                  onChanged={loadRecords}
                />
              )}
              {session && !isAdmin && (
                <UserRoutineHistory
                  routine={selected}
                  workoutRecords={
                    selected.id === "mon"
                      ? recoveryPushRecords
                      : selected.id === "thu"
                        ? pushRecords
                        : selected.id === "sat"
                          ? pullRecords
                          : selected.id === "sun"
                            ? sundayPullupRecords
                          : []
                  }
                  completionRecords={completionRecords}
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
    </>
  );
}

export default App;
