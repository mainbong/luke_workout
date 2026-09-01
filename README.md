# LUKE / 90일 운동 미션

2026년 7월 23일부터 10월 20일까지 이어지는 90일·13주 운동 프로그램입니다.
요일별 고정 루틴을 반복하며 화요일 휴식을 포함한 월~일 계획을 표시합니다.
2026년 9월 2일(Asia/Seoul)부터 날짜별 프로그램이 Gear Second v2로 전환되며,
이전 기록은 Beginner v1의 `program_version_id`를 그대로 유지합니다.

## 실행

React 19, TypeScript 7, Vite 8 기반의 프런트엔드이며, 운동 기록은 Supabase에 저장합니다.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

`.env.local`에 Supabase Project URL과 publishable key를 입력한 뒤 터미널에 출력된
로컬 주소를 브라우저에서 엽니다. 환경 변수가 없으면 루틴 열람은 가능하지만 기록 폼은
비활성 상태로 표시됩니다.

```bash
npm run check:admin-calendar
npm run check:program
npm run check:progression
npm run typecheck
npm run build
npm run preview
```

## 배포

GitHub Actions가 `main` 브랜치 변경을 감지해 Vite 빌드 결과를 GitHub Pages에 배포합니다.
빌드에는 아래 GitHub Actions 설정값을 사용합니다.

- Repository variable: `VITE_SUPABASE_URL`
- Repository secret: `VITE_SUPABASE_PUBLISHABLE_KEY`

## 페이지 범위

- 상단 미니맵은 한국 시간 기준 `과거 3일 · 오늘 · 미래 3일`의 연속 7일을 표시하며, 날짜가 바뀔 때마다 한 칸씩 이동합니다.
- 오늘은 항상 가운데 4번째 칸이며 기본 선택도 오늘입니다. 다른 날짜를 선택하면 해당 날짜의 루틴과 기록 폼을 표시합니다.
- 선택한 날짜에 따라 Beginner v1 또는 Gear Second v2의 정확한 루틴·입력 폼·증가 규칙을 표시합니다.
- Gear Second v2는 월요일 Push Recovery, 수요일 Pull Mission, 목요일 Push Mission, 토요일 Press, 일요일 Pull로 구성합니다.
- 월·수·목·일의 동적 목표는 로그인 사용자의 이전 성공 기록만으로 계산합니다.
- 금요일 푸쉬업 기술 훈련은 연결된 YouTube 영상의 20분 루틴을 따릅니다.
- 로그인 사용자는 선택한 요일에 자신이 저장한 모든 주차 기록을 확인할 수 있습니다.
- `mainbbong@gmail.com`으로 로그인하면 선택한 날짜뿐 아니라 선택한 요일에 누적된 모든 사용자·모든 주차 기록을 읽기 전용 관리자 패널에서 확인할 수 있습니다.

## Gear Second v2 입력 데이터

2026년 9월 2일부터 아래 값을 날짜별로 누적 저장합니다. 운동 날짜는 선택한 날짜를
기본값으로 사용하며 같은 날짜·항목을 다시 저장할 때만 해당 행을 수정합니다.

| 요일 | 입력값 |
| --- | --- |
| 월 | 리커버리 푸쉬업 5세트 각각의 실제 횟수, 에어 스쿼트를 포함한 루틴 완료 체크 |
| 화 | 휴식 완료 체크 |
| 수 | 풀업 목표 완료에 사용한 전체 세트 수, 러닝머신 15분 유지 속도 |
| 목 | 푸쉬업 전체 합계와 완료 세트 수, 플랭크 3세트 성공 여부와 적용한 Hold/휴식 초 |
| 금 | 푸쉬업 기술 루틴 완료 체크 |
| 토 | 딥스 1세트 최대 횟수, 러닝머신 5분 최고 속도, Press 루틴 완료 체크 |
| 일 | 맨몸 풀업 5세트 각각의 실제 횟수, Pull 루틴 완료 체크 |

Gear Second v2의 전체 처방·휴식·가이드 링크는
[`src/program-gear-second.json`](src/program-gear-second.json)과
[Notion 기준 문서](https://app.notion.com/p/3cebe971bff78144884ffe8cc7623006)를 기준으로 합니다.

## 프로젝트 구조

```text
.
├── .github/workflows/deploy-pages.yml # GitHub Pages 빌드·배포
├── src/
│   ├── App.tsx       # 주간 루틴, 로그인, 결과 입력과 목표 계산
│   ├── program.json  # Beginner v1의 JSON 정의와 증가 규칙
│   ├── program-gear-second.json # Gear Second v2의 JSON 정의
│   ├── program.ts    # DB 프로그램 검증, 로컬 fallback과 화면 치환
│   ├── supabase.ts   # Supabase 브라우저 클라이언트
│   └── main.tsx      # React 진입점
├── supabase/
│   ├── config.toml   # Auth 허용 URL 등 프로젝트 설정
│   └── migrations/   # 프로그램 버전, 누적 기록, 관리자 RPC와 RLS
├── index.html
├── styles.css
├── vite.config.ts
└── README.md
```

## 데이터와 보안

- `workout_program_versions`에는 주간 프로그램 전체를 immutable JSONB 버전으로 저장하고 누구나 읽을 수 있게 공개합니다. 수정·삭제는 DB trigger가 거부합니다.
- 신규 `workout_sessions`와 `routine_completions`는 수행 날짜에 유효한 `program_version_id`를 저장하며 이 연결은 변경할 수 없습니다. 도입 전 기록은 추정해 덮어쓰지 않고 `NULL`로 보존합니다.
- `workout_sessions`에는 로그인 사용자 ID, 운동 날짜, 종목, 당시 목표, 전체·세트별 횟수와 세트 수를 저장합니다.
- 운동별 확장값은 `details` JSONB에 저장합니다. 현재 키는 `treadmill_speed`, `plank_succeeded`, `plank_hold_seconds`, `plank_rest_seconds`, `dips_max_reps`입니다.
- `routine_completions`에는 날짜별 완료 여부와 완료형 루틴의 `details`를 저장합니다.
- 같은 날짜·종목을 다시 저장하면 해당 행만 수정되고, 다음 주 날짜의 기록은 새 행으로 추가되어 덮어쓰지 않고 누적됩니다.
- Row Level Security(RLS)로 로그인한 사용자가 자신의 기록만 조회·작성·수정·삭제할 수 있습니다.
- 전체 사용자 기록은 이메일 허용 목록을 서버 측에서 다시 검사하는 관리자 전용 DB 함수로만 조회하며, 현재는 `mainbbong@gmail.com` 한 계정만 허용합니다.
- 관리자 기능은 조회 전용으로 다른 사용자의 기록을 수정하거나 삭제하는 권한을 부여하지 않습니다.
- 이메일 주소는 Supabase Auth가 로그인 용도로 관리하며 앱의 운동 기록 테이블에는 저장하지 않습니다.
- 로그인 링크는 한 번만 사용할 수 있으므로 항상 가장 최근에 발급된 링크를 사용합니다. 만료되면 페이지에 오류와 재발급 안내가 표시됩니다.
- DB 비밀번호와 secret/service-role key는 프런트엔드 및 저장소에 넣지 않습니다.
- Supabase Free 플랜의 사용량·휴면 정책을 따르며, 계정이 같으면 다른 기기에서도 기록을 볼 수 있습니다.

## DB 마이그레이션

`20260901000500_launch_gear_second_v2.sql`은 `details` JSONB와 검증, 완료 기록 수정
RLS, 푸쉬업 세트 수 제약, Gear Second v2 시드와 관리자 조회 필드를 함께 적용합니다.
`20260901000600_harden_record_identity.sql`은 누적 기록의 사용자·종목·요일 식별자를 변경할 수 없게 고정합니다.
`20260901000700_require_complete_five_set_records.sql`은 버전 경계와 5세트 입력의 기존 데이터 사전 검사를 통과한 뒤 `set_reps`를 필수로 강제합니다.

```bash
supabase migration list --linked
supabase db push --dry-run
supabase db push
supabase db lint --linked --fail-on error
```

## Beginner v1 운동 프로그램 원칙 (2026-07-23~2026-09-01)

- 월요일 리커버리 푸쉬업은 사용자별 15회×5세트에서 시작합니다. 세트 안에서 멈추면 3초 안에 정자세 푸쉬업을 다시 시작하고, 1회씩 진행하더라도 정자세로 목표 횟수를 모두 채운 뒤 쉽니다. 인클라인·무릎 푸쉬업은 허용하지 않으며 세트 간 휴식은 1분 30초~2분 30초입니다. 5세트 모두 목표를 달성하면 해당 사용자의 다음 월요일 목표가 세트당 1회 증가하고, 실패하면 유지됩니다.
- 화요일은 별도 운동 없는 완전 휴식일입니다.
- 수요일은 덤벨 숄더프레스 10회×3세트, 덤벨컬 10회×3세트, 덤벨 오버헤드 트라이셉스 익스텐션 12회×3세트, 원암 덤벨로우 한쪽 15회×5세트와 속도 7 러닝머신 10분으로 구성합니다.
- 수요일 팔 3종은 첫 세트 RPE 7~8의 무게를 유지하고 목표 횟수에 실패하면 감량합니다. 원암 덤벨로우는 RPE 8로 시작해 최소 단위로 증량하다가 15회 실패 시 증량을 멈춥니다.
- 수요일 4개 동작에는 한국어 쇼츠, 짧은 상세 YouTube 영상과 ACE 자세 참고 링크를 함께 제공합니다.
- 목요일 푸쉬업 미션은 정자세 실패 직전까지 최대 5세트, 세트 간 1분 30초, 첫 목표 총량 100회입니다. 5세트 합계가 목표 이상이면 다음 목표가 10회 증가하고, 실패하면 유지됩니다. 실제 합계를 저장해야 해당 날짜가 완료 처리되고 기록이 표시됩니다.
- 금요일은 20분 푸쉬업 기술 영상과 동작 간 15초 휴식을 따릅니다.
- 토요일 풀업 미션은 보조 조건 없이 총 30회를 완료할 때까지 진행하며, 한 세트의 횟수는 자유입니다. 철봉에서 내려오면 1분 30초를 쉬고 바로 다음 세트에 들어갑니다. 세트 수에 상한은 없으며 10세트 안에 완료하면 다음 풀업 데이 목표는 40회, 11세트 이상이면 30회를 유지합니다. 예: `5+5+3+3+3+3+2+2+2+2=30`은 10세트 성공입니다.
- 풀업 후 러닝머신은 매주 속도 10 이상으로 10분 진행합니다.
- 일요일 풀업은 3회×5세트에서 시작해 5세트 모두 맨몸으로 성공하면 사용자별 다음 목표가 세트당 1회 증가하며, 시티드 케이블 로우·스트레이트 암 풀다운·페이스풀 각 15회×5세트와 러닝머신 10분을 이어갑니다.
- 일요일 각 운동에는 장비 설정과 자세를 미리 확인할 수 있는 작은 YouTube 가이드 링크를 제공합니다.
- 별도 결과값을 입력하지 않는 루틴은 로그인 후 완료 체크로 날짜별 수행 여부를 저장합니다.
- 루틴의 구성은 매주 고정하고, 훈련 성과에 따라 현재 목표 숫자만 갱신합니다.
- 예리한 통증, 흉통, 심한 호흡곤란, 어지럼증이 생기면 즉시 운동을 중단합니다.

이 프로그램은 일반적인 운동 정보이며 의료 진단이나 치료를 대신하지 않습니다.
