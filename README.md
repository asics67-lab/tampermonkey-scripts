# Tampermonkey 스크립트 저장소

물류 시스템(입고 / 포장 / 관리) 업무 효율화를 위한 Tampermonkey 스크립트 모음입니다.

```
tampermonkey-scripts/
├── 입고/
│   ├── 01-tracking-modal.user.js       (트래킹넘버 모달 통합)
│   └── 02-jancode-shortcuts.user.js    (JAN코드 화면 단축키 통합)
├── 포장/
│   └── README.md   (아직 소스 없음)
└── 관리/
    └── README.md   (아직 소스 없음)
```

## 1. GitHub에 올리기 (최초 1회)

1. GitHub에서 새 저장소 생성 (Private 추천 — 사내 시스템 URL/로직이 담겨있어 공개 저장소는 비권장)
2. 이 폴더 전체를 그대로 push
   ```bash
   git init
   git add .
   git commit -m "초기 스크립트 정리: 입고 2개 통합"
   git branch -M main
   git remote add origin https://github.com/YOUR_ID/tampermonkey-scripts.git
   git push -u origin main
   ```
3. 각 `.user.js` 파일 상단의 `YOUR_ID` 부분을 실제 GitHub 계정/조직명으로 바꾸고 다시 push
   (`@namespace`, `@updateURL`, `@downloadURL` 3곳)

> **Private 저장소를 쓰는 경우 주의**: `raw.githubusercontent.com`은 기본적으로 로그인 세션이 없으면 접근이 막힙니다.
> Tampermonkey가 배경에서 폴링할 때는 브라우저 로그인 세션을 안 타므로, Private 저장소는 그대로면 자동 업데이트가 실패할 수 있습니다.
> 해결책: ① 저장소를 Public으로 하거나, ② GitHub Pages로 배포하거나, ③ 사내 서버에 별도 호스팅하는 방법 중 선택하시면 됩니다. 필요하시면 이 부분도 같이 세팅해 드릴게요.

## 2. Tampermonkey에 처음 설치할 때

각 팀원 PC에서:
1. Tampermonkey 대시보드 → "새 스크립트" 대신 **"파일에서 가져오기(Import)"** 또는
2. `https://raw.githubusercontent.com/YOUR_ID/tampermonkey-scripts/main/입고/01-tracking-modal.user.js` 주소를 브라우저 주소창에 직접 입력
   → Tampermonkey가 자동으로 설치 화면을 띄워줌 (userscript 파일은 이렇게 열면 바로 인식됩니다)

## 3. 이후 업데이트 방식 (자동 반영)

1. 시스템 화면이 바뀌어서 스크립트 수정이 필요해지면
2. 로컬(또는 여기 Claude)에서 코드 수정
3. **`@version`을 반드시 올림** (예: `1.1.0` → `1.1.1`) — Tampermonkey는 버전 비교로 업데이트 여부를 판단합니다
4. GitHub에 push
5. 각 팀원 PC의 Tampermonkey가 설정된 주기(기본 1일, Tampermonkey 설정에서 더 짧게 조정 가능)로
   `@updateURL`을 체크 → 새 버전 발견 시 자동 다운로드/적용

버전을 안 올리면 내용이 바뀌어도 업데이트로 인식되지 않으니, 이 부분만 잊지 않으시면 됩니다.

## 4. 폴더 확장

포장/관리 소스도 준비되시면 지금과 같은 방식(코드 붙여넣기 → 통합/정리 → 메타데이터 표준화)으로
`포장/`, `관리/` 폴더에 채워드릴 수 있습니다.
