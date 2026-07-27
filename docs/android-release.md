# Android 릴리스 배포 절차

심사위원·검증자가 실기기에 설치할 수 있도록 **서명된 release APK**를 GitHub Release로 배포한다.
디버그 APK는 배포하지 않는다 — 디버그 서명은 공개된 기본 키라 누구나 같은 서명으로 앱을 만들 수
있고, 검증자가 받은 파일이 우리가 만든 것인지 확인할 방법이 없다.

## 비밀값 취급

- `apps/android/keystore.properties`와 `*.jks`는 **커밋하지 않는다**(`.gitignore`).
- keystore 파일과 비밀번호는 저장소·릴리스·이슈·PR 어디에도 올리지 않는다.
- 릴리스 노트에는 인증서 SHA-256 **지문(공개 정보)** 만 적는다. 지문은 비밀값이 아니라
  검증자가 파일 출처를 확인하는 수단이다.

## 1. 빌드

```powershell
.\apps\android\gradlew.bat -p .\apps\android :app:assembleRelease `
  -PMULSIGYE_API_BASE_URL=https://3rd-krc-ai-digital-web.vercel.app/
```

`MULSIGYE_API_BASE_URL`은 release 빌드에서 필수이며 `https://`로 시작하고 `/`로 끝나야 한다
(`app/build.gradle.kts`가 빌드 시작 시 검사한다). `keystore.properties`가 없으면 debug 서명으로
폴백하므로, 배포용 빌드는 반드시 아래 2단계로 **release 키 서명인지 확인한 뒤** 올린다.

산출물: `apps/android/app/build/outputs/apk/release/app-release.apk`

## 2. 서명 검증(생략 금지)

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs `
  .\apps\android\app\build\outputs\apk\release\app-release.apk
```

확인할 것:

- `Verifies` 가 출력된다.
- `Verified using v2 scheme (APK Signature Scheme v2): true`
- `Signer #1 certificate DN: CN=Mulsigye, ...` — debug 키(`CN=Android Debug`)가 아니어야 한다.
- 인증서 SHA-256 지문이 이전 릴리스와 같다. 달라졌다면 다른 키로 서명된 것이며,
  사용자는 기존 앱을 지워야만 설치할 수 있다.

패키지 정보도 함께 확인한다.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\aapt2.exe" dump badging `
  .\apps\android\app\build\outputs\apk\release\app-release.apk
```

`package: name='com.mulsigye.app' versionCode='…' versionName='…'`, `minSdkVersion:'26'`을 본다.
`versionCode`는 배포할 때마다 올린다(`app/build.gradle.kts`).

## 3. 파일 해시

```powershell
Get-FileHash .\apps\android\app\build\outputs\apk\release\app-release.apk -Algorithm SHA256
```

이 값을 릴리스 노트에 적는다. 받는 쪽이 같은 명령으로 파일이 바뀌지 않았는지 확인할 수 있다.

## 4. GitHub Release 발행

```powershell
gh release create android-v<버전> `
  .\apps\android\app\build\outputs\apk\release\app-release.apk `
  --title "수신호 <버전> (서명 release)" --notes-file <노트파일>
```

릴리스 노트에 반드시 포함할 것:

- 버전(`versionName` + `versionCode`)과 빌드한 커밋 SHA
- APK 파일 SHA-256
- 서명 인증서 SHA-256 지문
- 연결된 서버 주소(`MULSIGYE_API_BASE_URL`)
- 설치 방법과 최소 Android 버전(8.0 / API 26)

## 5. 설치 안내(사용자에게 전달할 문구)

1. 안드로이드 휴대전화에서 릴리스 페이지의 APK를 내려받아요.
2. "이 출처의 앱 설치" 권한을 물어보면 허용해요. 스토어를 거치지 않는 파일이라 한 번 물어봐요.
3. 이전에 시험용(디버그) 앱을 깔았다면 **먼저 지운 뒤** 설치해요. 서명이 달라 덮어쓰기가 안 돼요.
4. Android 8.0 이상에서 동작해요.

## 참고

- Play 스토어용 번들이 필요하면 같은 방식으로 `:app:bundleRelease`를 쓴다. 공모전 제출은
  직접 설치가 기준이라 기본 배포물은 APK다.
- 이 문서의 검증 명령과 판단 기준은 [testing-and-feedback.md](testing-and-feedback.md)의
  검증 SSOT를 따른다.
