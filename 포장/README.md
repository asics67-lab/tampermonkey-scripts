# 포장 (Packing)

아직 이 폴더에는 정리된 소스가 없습니다.

포장 관련 소스를 정리하실 때는 다음 형식을 따라주세요.

## 진행 방법
1. 기존 포장 관련 소스(여러 개)를 하나씩 Claude에게 붙여넣기/업로드
2. 중복/충돌 로직 통합, 메타데이터 표준화
3. 이 폴더(`포장/`)에 파일명 규칙에 맞춰 저장
   - 예: `01-packing-modal.user.js`, `02-shipping-label.user.js`

## 파일명 및 메타데이터 규칙
- 파일명: `NN-역할설명.user.js` (숫자는 실행/의존 순서가 있다면 순서대로)
- `@updateURL`, `@downloadURL`: 저장소 root 기준
  `https://raw.githubusercontent.com/YOUR_ID/tampermonkey-scripts/main/포장/파일명.user.js`
- `@version`: 수정할 때마다 반드시 올릴 것 (자동 업데이트 감지 기준)
