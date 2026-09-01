create table public.workout_program_versions (
  id text primary key check (char_length(id) between 1 and 128),
  program_key text not null check (char_length(program_key) between 1 and 64),
  version integer not null check (version > 0),
  definition jsonb not null,
  effective_from date not null,
  source_url text not null check (char_length(source_url) > 0),
  created_at timestamptz not null default now(),
  unique (program_key, version),
  constraint workout_program_versions_definition_object_check
    check (jsonb_typeof(definition) = 'object'),
  constraint workout_program_versions_schema_version_check
    check (definition @> '{"schemaVersion": 1}'::jsonb),
  constraint workout_program_versions_days_check
    check (
      case jsonb_typeof(definition -> 'days')
        when 'array' then jsonb_array_length(definition -> 'days') = 7
        else false
      end
    ),
  constraint workout_program_versions_progressions_check
    check (coalesce(jsonb_typeof(definition -> 'progressions'), '') = 'object'),
  constraint workout_program_versions_metadata_check
    check (
      (definition ->> 'programKey') is not distinct from program_key
      and (definition ->> 'effectiveFrom') is not distinct from effective_from::text
      and (definition ->> 'sourceUrl') is not distinct from source_url
    )
);

insert into public.workout_program_versions (
  id,
  program_key,
  version,
  definition,
  effective_from,
  source_url
)
values (
  'luke-weekly-2026-07-23',
  'luke-weekly',
  1,
  $program$
{
  "schemaVersion": 1,
  "programKey": "luke-weekly",
  "title": "루크 주간 운동 프로그램",
  "timezone": "Asia/Seoul",
  "cycle": "weekly",
  "effectiveFrom": "2026-07-23",
  "sourceUrl": "https://app.notion.com/p/3cebe971bff78173bb47f5ce07a75d78",
  "safety": {
    "stopWhen": ["예리한 통증", "흉통", "어지럼증"],
    "disclaimer": "이 프로그램은 사용자가 직접 정한 운동 계획이며 의료 진단이나 치료를 대신하지 않습니다."
  },
  "progressions": {
    "recovery_pushup": {
      "routineId": "mon",
      "initialTarget": 15,
      "increment": 1,
      "setCount": 5,
      "success": "all_sets_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    },
    "pushup": {
      "routineId": "thu",
      "initialTarget": 100,
      "increment": 10,
      "setCount": 5,
      "success": "total_reps_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    },
    "pullup": {
      "routineId": "sat",
      "initialTarget": 30,
      "increment": 10,
      "successSetCount": 10,
      "success": "target_completed_at_or_below_set_count",
      "failure": "hold",
      "scope": "user"
    },
    "sunday_pullup": {
      "routineId": "sun",
      "initialTarget": 3,
      "increment": 1,
      "setCount": 5,
      "success": "all_sets_unassisted_at_or_above_target",
      "failure": "hold",
      "scope": "user"
    }
  },
  "days": [
    {
      "id": "mon",
      "day": "MON",
      "ko": "월요일",
      "status": "ready",
      "short": "푸쉬업 {{recoveryPushTarget}}×5",
      "category": "PUSH RECOVERY",
      "title": "리커버리 푸쉬업",
      "summary": "{{recoveryPushTarget}}회를 한 세트로 끝까지 연결하되, 자세를 지키며 회복성 볼륨을 쌓습니다.",
      "target": "오늘 목표 · {{recoveryPushTarget}}회 × 5세트",
      "exercises": [
        {
          "name": "리커버리 푸쉬업",
          "prescription": "{{recoveryPushTarget}}회 × 5세트",
          "note": "{{recoveryPushTarget}}회를 최대한 언브로큰으로 진행합니다. 멈추더라도 3초 안에 다시 시작하고, 3초마다 1회씩 하더라도 정자세 푸쉬업으로 {{recoveryPushTarget}}회를 모두 마친 뒤에 쉽니다. 인클라인·무릎 푸쉬업은 허용하지 않습니다."
        },
        {
          "name": "세트 간 휴식",
          "prescription": "1분 30초 ~ 2분 30초",
          "note": "호흡과 자세가 회복되면 범위 안에서 다음 세트를 시작합니다."
        }
      ]
    },
    {
      "id": "tue",
      "day": "TUE",
      "ko": "화요일",
      "status": "ready",
      "short": "완전 휴식",
      "category": "REST DAY",
      "title": "완전 휴식",
      "summary": "별도 운동을 진행하지 않고 다음 훈련을 위해 회복합니다.",
      "target": "오늘 목표 · 운동 없음",
      "exercises": [
        {
          "name": "휴식",
          "prescription": "운동 없음",
          "note": "정해진 운동 루틴 없이 쉽니다. 피로감이나 통증이 남아 있다면 회복을 우선합니다."
        }
      ]
    },
    {
      "id": "wed",
      "day": "WED",
      "ko": "수요일",
      "status": "ready",
      "short": "팔 + 로우 + 러닝",
      "category": "ARMS + ROW",
      "title": "팔 루틴 + 원암 덤벨로우",
      "summary": "팔 3종은 다음 날 푸쉬업 미션을 고려해 여유를 남기고, 원암 덤벨로우는 RPE 8 기준으로 진행합니다.",
      "target": "오늘 목표 · 상체 4종 + 러닝머신 10분",
      "exercises": [
        {
          "name": "덤벨 숄더프레스",
          "prescription": "10회 × 3세트",
          "note": "첫 세트가 RPE 7~8인 무게를 정해 3세트 동안 유지합니다. 10회에 실패하면 다음 세트부터 감량해 10회를 채우고, 허리가 뜨거나 팔의 좌우 균형이 무너지면 즉시 종료합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 핵심 4포인트", "url": "https://www.youtube.com/shorts/QqhMqG8YO2k" },
            { "label": "한국어 상세 · 완전 기초 2분", "url": "https://www.youtube.com/watch?v=OMCJoZfKhxM" },
            { "label": "ACE · 자세 참고", "url": "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/" }
          ]
        },
        {
          "name": "덤벨컬",
          "prescription": "10회 × 3세트",
          "note": "첫 10회가 RPE 7~8인 무게로 3세트를 진행합니다. 반동 없이 팔꿈치 위치와 손목을 유지하고, 10회에 실패하면 감량해 남은 세트의 10회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 덤벨컬 방법", "url": "https://www.youtube.com/shorts/M3kVtY-oLsk" },
            { "label": "한국어 상세 · 고립과 기본 자세", "url": "https://www.youtube.com/watch?v=z3w1txqnGBs" },
            { "label": "ACE · 자세 참고", "url": "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/" }
          ]
        },
        {
          "name": "덤벨 오버헤드 트라이셉스 익스텐션",
          "prescription": "12회 × 3세트",
          "note": "덤벨 하나를 양손으로 잡습니다. 첫 12회가 RPE 7~8인 무게를 유지하고, 실패하면 감량해 12회를 채웁니다. 팔꿈치는 정면과 어깨너비를 유지하며 머리나 목에 닿지 않게 천천히 내립니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 정석 자세", "url": "https://www.youtube.com/shorts/V8YlItAMIsU" },
            { "label": "한국어 상세 · 덤벨 오버헤드 삼두", "url": "https://www.youtube.com/watch?v=hzMKVpTK1GI" },
            { "label": "ACE · 자세 참고", "url": "https://www.acefitness.org/resources/everyone/exercise-library/74/triceps-extension/" }
          ]
        },
        {
          "name": "원암 덤벨로우",
          "prescription": "한쪽 15회 × 5세트",
          "note": "벤치에 반대쪽 손과 무릎을 지지합니다. 첫 15회가 RPE 8인 무게로 시작해 가능한 가장 작은 단위로 증량합니다. 15회에 실패하면 증량을 멈추고 남은 세트는 같은 무게로 자세를 유지할 수 있는 최대 횟수까지 진행합니다. 양쪽을 마쳐야 1세트입니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 정자세", "url": "https://www.youtube.com/shorts/j1EyGHSSw-0" },
            { "label": "한국어 상세 · 벤치 활용 기초", "url": "https://www.youtube.com/watch?v=5y2LKebrvAk" },
            { "label": "ACE · 자세 참고", "url": "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/" }
          ]
        },
        {
          "name": "세트 간 휴식",
          "prescription": "1분 30초 ~ 2분",
          "note": "원암 덤벨로우는 양쪽을 모두 마친 뒤 휴식합니다."
        },
        {
          "name": "러닝머신",
          "prescription": "속도 7 · 10분",
          "note": "웨이트 루틴을 모두 마친 뒤 진행합니다."
        }
      ]
    },
    {
      "id": "thu",
      "day": "THU",
      "ko": "목요일",
      "status": "ready",
      "short": "푸쉬업 {{pushTarget}}",
      "category": "WEIGHT PUSH",
      "title": "푸쉬업 맥스 미션",
      "summary": "정자세로 가능한 최대 반복을 5세트 수행하고, 세트 합계로 이번 미션의 성공 여부를 판정합니다.",
      "target": "현재 목표 · 5세트 합계 {{pushTarget}}회",
      "exercises": [
        {
          "name": "1. 세트 수행",
          "prescription": "최대 5세트",
          "note": "각 세트는 정자세를 유지할 수 있는 실패 직전까지 수행합니다. 허리가 꺾이거나 몸통이 무너지는 등 자세가 흐트러지기 시작하면 억지로 반복하지 않고 그 세트를 종료합니다."
        },
        {
          "name": "2. 세트 사이",
          "prescription": "1분 30초",
          "note": "세트가 끝나면 정확히 1분 30초를 쉬고 다음 세트에 들어갑니다. 같은 방식으로 최대 5세트까지만 진행합니다."
        },
        {
          "name": "3. 오늘의 성공 판정",
          "prescription": "5세트 합계 {{pushTarget}}회",
          "note": "5세트에서 수행한 횟수를 모두 더합니다. 합계가 {{pushTarget}}회 이상이면 성공이고, 미만이면 실패입니다. 결과 입력에는 5세트 합계만 기록합니다."
        },
        {
          "name": "4. 다음 푸쉬업 데이",
          "prescription": "성공 +10회 · 실패 유지",
          "note": "성공하면 다음 목요일의 5세트 합계 목표가 {{nextPushTarget}}회로 올라갑니다. 실패하면 다음 목요일에도 {{pushTarget}}회에 다시 도전합니다. 목표 계산은 로그인한 사용자 자신의 기록만 사용합니다."
        }
      ]
    },
    {
      "id": "fri",
      "day": "FRI",
      "ko": "금요일",
      "status": "ready",
      "short": "푸쉬업 기술",
      "category": "PUSH SKILL",
      "title": "푸쉬업 기술 루틴",
      "summary": "영상의 다양한 푸쉬업 동작을 따라 하며 반복 수보다 기술을 익힙니다.",
      "target": "현재 목표 · 영상 루틴 20분 완주",
      "exercises": [
        {
          "name": "영상 가이드 루틴",
          "prescription": "20분 · 1회",
          "note": "영상의 동작과 순서를 그대로 따라 하기."
        },
        {
          "name": "동작 간 휴식",
          "prescription": "15초"
        }
      ],
      "link": {
        "label": "초보자가 꼭 해야 할 푸쉬업 20분 루틴",
        "url": "https://www.youtube.com/watch?v=Di-lTiYsQeE"
      }
    },
    {
      "id": "sat",
      "day": "SAT",
      "ko": "토요일",
      "status": "ready",
      "short": "풀업 {{pullTarget}}",
      "category": "WEIGHT PULL",
      "title": "풀업 미션 + 러닝머신",
      "summary": "한 세트의 횟수는 자유롭게 끊되, 오늘의 목표 총량을 모두 채울 때까지 반복합니다.",
      "target": "현재 목표 · 풀업 총 {{pullTarget}}회",
      "exercises": [
        {
          "name": "1. 오늘의 종료 조건",
          "prescription": "총 {{pullTarget}}회 · 완료할 때까지",
          "note": "하루의 정해진 총 {{pullTarget}}회를 모두 채우면 풀업 미션을 종료합니다. '최대 10세트'가 아니므로 10세트를 넘겨도 목표 횟수를 성공할 때까지 계속합니다."
        },
        {
          "name": "2. 세트 수행과 휴식",
          "prescription": "철봉에서 내려오면 1분 30초",
          "note": "한 세트에 몇 개씩 끊어가는지는 자유입니다. 철봉에서 내려오는 순간 한 세트가 끝나며, 1분 30초를 쉰 뒤 바로 다음 세트에 들어갑니다."
        },
        {
          "name": "3. 성공 판정 예시",
          "prescription": "30회 · 10세트 이내 성공",
          "note": "예: 5, 5, 3, 3, 3, 3, 2, 2, 2, 2회 = 총 30회, 10세트. 10세트 안에 목표를 채웠으므로 다음 풀업 데이 목표는 40회입니다."
        },
        {
          "name": "4. 다음 풀업 데이",
          "prescription": "10세트 이내 +10회 · 11세트 이상 유지",
          "note": "총 {{pullTarget}}회를 10세트 이내에 마치면 다음 풀업 데이 목표가 {{nextPullTarget}}회로 올라갑니다. 11세트 이상 걸렸다면 목표를 완수했더라도 다음 풀업 데이에 같은 {{pullTarget}}회로 다시 도전합니다. 완료에 사용한 전체 세트 수를 반드시 기록합니다."
        },
        {
          "name": "러닝머신",
          "prescription": "속도 10 이상 · 10분",
          "note": "풀업 미션을 마친 뒤 진행합니다."
        }
      ]
    },
    {
      "id": "sun",
      "day": "SUN",
      "ko": "일요일",
      "status": "ready",
      "short": "등 볼륨 · 풀업 {{sundayPullupTarget}}×5",
      "category": "BACK VOLUME",
      "title": "등 볼륨 루틴 + 러닝머신",
      "summary": "반복 수와 자세를 우선하며, 정한 규칙에 따라 보조·증량·감량을 적용합니다.",
      "target": "오늘 목표 · 풀업 {{sundayPullupTarget}}회 × 5세트 + 등 운동 3종 + 러닝머신 10분",
      "exercises": [
        {
          "name": "풀업",
          "prescription": "{{sundayPullupTarget}}회 × 5세트",
          "note": "각 세트는 맨몸으로 {{sundayPullupTarget}}회에 도전합니다. 실패하면 풀업머신으로 전환해 해당 세트의 {{sundayPullupTarget}}회를 채웁니다. 5세트 모두 맨몸으로 성공하면 다음 일요일부터 세트당 1회 증가하고, 한 세트라도 머신 보조를 쓰면 목표를 유지합니다.",
          "guides": [
            { "label": "보조 풀업머신 셋업·안전", "url": "https://www.youtube.com/watch?v=fnHeovkmkkk" }
          ]
        },
        {
          "name": "시티드 케이블 로우",
          "prescription": "15회 × 5세트",
          "note": "15회를 당겨 RPE 8인 시작 무게를 정합니다. 매 세트 한 칸씩 증량하며 15회를 채우고, 실패하면 증량을 멈춘 뒤 남은 세트는 같은 무게로 가능한 최대 횟수까지 진행합니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 1분 자세", "url": "https://www.youtube.com/shorts/YeQDG8uUE3M" },
            { "label": "한국어 상세 가이드 · 2분대", "url": "https://www.youtube.com/watch?v=guLhRDd8VTA" }
          ]
        },
        {
          "name": "스트레이트 암 풀다운",
          "prescription": "15회 × 5세트",
          "note": "첫 15회가 RPE 8인 무게를 찾고 같은 무게로 5세트를 진행합니다. 15회에 실패하면 자세를 유지할 수 있도록 계속 감량하면서 15회를 채웁니다.",
          "guides": [
            { "label": "한국어 쇼츠 · 자극 잡기", "url": "https://www.youtube.com/shorts/0sUwxJgXBdQ" },
            { "label": "상세 셋업·자세", "url": "https://www.youtube.com/watch?v=98W63pVdW38" }
          ]
        },
        {
          "name": "케이블 페이스풀",
          "prescription": "15회 × 5세트",
          "note": "셋업과 자세를 미리 충분히 숙지합니다. 첫 15회가 RPE 8인 무게로 시작하고, 이후 15회에 실패하면 감량하면서 매 세트 15회를 채웁니다.",
          "guides": [
            { "label": "페이스풀 실수 10가지와 교정", "url": "https://www.youtube.com/watch?v=cc0tasCalHg" }
          ]
        },
        {
          "name": "러닝머신",
          "prescription": "속도 10 이상 · 10분",
          "note": "등 운동을 모두 마친 뒤 진행합니다.",
          "guides": [
            { "label": "Life Fitness 러닝머신 조작 예시", "url": "https://www.youtube.com/watch?v=usScM1QZrQw" },
            { "label": "기본 러닝 자세", "url": "https://www.youtube.com/watch?v=_kGESn8ArrU" }
          ]
        }
      ]
    }
  ]
}
$program$::jsonb,
  date '2026-07-23',
  'https://app.notion.com/p/3cebe971bff78173bb47f5ce07a75d78'
);

create function public.reject_workout_program_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Workout program versions are immutable'
    using errcode = '55000';
end;
$$;

create trigger reject_workout_program_version_mutation
before update or delete on public.workout_program_versions
for each row execute function public.reject_workout_program_version_mutation();

alter table public.workout_program_versions enable row level security;

revoke all on table public.workout_program_versions from public, anon, authenticated;
grant select on table public.workout_program_versions to anon, authenticated;

create policy "Anyone can read workout program versions"
on public.workout_program_versions
for select
to anon, authenticated
using (true);

alter table public.workout_sessions
add column program_version_id text
references public.workout_program_versions(id)
on update restrict
on delete restrict;

alter table public.routine_completions
add column program_version_id text
references public.workout_program_versions(id)
on update restrict
on delete restrict;

alter table public.workout_sessions
alter column program_version_id set default 'luke-weekly-2026-07-23';

alter table public.routine_completions
alter column program_version_id set default 'luke-weekly-2026-07-23';

create function public.enforce_record_program_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.program_version_id is null then
      raise exception 'New workout records require a program version'
        using errcode = '23502';
    end if;

    if not exists (
      select 1
      from public.workout_program_versions as program
      where program.id = new.program_version_id
        and program.id = (
          select active_program.id
          from public.workout_program_versions as active_program
          where active_program.program_key = program.program_key
            and active_program.effective_from <= new.workout_date
          order by active_program.effective_from desc, active_program.version desc
          limit 1
        )
    ) then
      raise exception 'Program version is not active for workout date'
        using errcode = '23514';
    end if;
  else
    if new.program_version_id is distinct from old.program_version_id then
      raise exception 'Workout record program version is immutable'
        using errcode = '55000';
    end if;

    if new.workout_date is distinct from old.workout_date then
      raise exception 'Workout record date is immutable'
        using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_workout_session_program_version
before insert or update on public.workout_sessions
for each row execute function public.enforce_record_program_version();

create trigger enforce_routine_completion_program_version
before insert or update on public.routine_completions
for each row execute function public.enforce_record_program_version();

drop function public.get_admin_monthly_records(date);

create function public.get_admin_monthly_records(target_month date)
returns table (
  user_id uuid,
  user_email text,
  workout_date date,
  record_kind text,
  routine_id text,
  workout_type text,
  program_version_id text,
  target_total integer,
  total_reps integer,
  set_count integer,
  set_reps integer[],
  recorded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start date;
  month_end date;
begin
  if coalesce((select auth.jwt() ->> 'email'), '') <> 'mainbbong@gmail.com' then
    raise exception 'Administrator access required'
      using errcode = '42501';
  end if;

  if target_month is null then
    raise exception 'Target month is required'
      using errcode = '22004';
  end if;

  month_start := date_trunc('month', target_month)::date;
  month_end := (month_start + interval '1 month')::date;

  return query
    select
      auth_user.id,
      auth_user.email::text,
      monthly_record.workout_date,
      monthly_record.record_kind,
      monthly_record.routine_id,
      monthly_record.workout_type,
      monthly_record.program_version_id,
      monthly_record.target_total,
      monthly_record.total_reps,
      monthly_record.set_count,
      monthly_record.set_reps,
      monthly_record.recorded_at
    from auth.users as auth_user
    left join lateral (
      select
        workout.workout_date,
        'workout_session'::text as record_kind,
        null::text as routine_id,
        workout.workout_type,
        workout.program_version_id,
        workout.target_total,
        workout.total_reps,
        workout.set_count,
        workout.set_reps,
        workout.updated_at as recorded_at
      from public.workout_sessions as workout
      where workout.user_id = auth_user.id
        and workout.workout_date >= month_start
        and workout.workout_date < month_end

      union all

      select
        completion.workout_date,
        'routine_completion'::text as record_kind,
        completion.routine_id,
        null::text as workout_type,
        completion.program_version_id,
        null::integer as target_total,
        null::integer as total_reps,
        null::integer as set_count,
        null::integer[] as set_reps,
        completion.completed_at as recorded_at
      from public.routine_completions as completion
      where completion.user_id = auth_user.id
        and completion.workout_date >= month_start
        and completion.workout_date < month_end
    ) as monthly_record on true
    order by
      auth_user.email nulls last,
      auth_user.id,
      monthly_record.workout_date nulls last,
      monthly_record.record_kind nulls last,
      monthly_record.routine_id nulls last,
      monthly_record.workout_type nulls last,
      monthly_record.recorded_at nulls last;
end;
$$;

revoke execute on function public.get_admin_monthly_records(date) from public;
revoke execute on function public.get_admin_monthly_records(date) from anon;
grant execute on function public.get_admin_monthly_records(date) to authenticated;

-- Manual rollback, after deploying an app version that no longer reads or writes program_version_id:
-- drop trigger if exists enforce_routine_completion_program_version on public.routine_completions;
-- drop trigger if exists enforce_workout_session_program_version on public.workout_sessions;
-- drop function if exists public.get_admin_monthly_records(date);
-- recreate get_admin_monthly_records(date) from migration 20260901000300 before dropping the columns below;
-- alter table public.routine_completions drop column if exists program_version_id;
-- alter table public.workout_sessions drop column if exists program_version_id;
-- drop table if exists public.workout_program_versions;
-- drop function if exists public.enforce_record_program_version();
-- drop function if exists public.reject_workout_program_version_mutation();
