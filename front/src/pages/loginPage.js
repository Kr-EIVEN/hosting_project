// src/pages/loginPage.js
import React, { useState } from "react";
import "../App.css";
import "./page.css";

function LoginPage({ onLoginSuccess }) {
  // 패널 전환(로그인 / 회원가입)
  const [isRightPanelActive, setIsRightPanelActive] = useState(false);

  // 기존 내부 메시지 (폼 아래 영역)
  const [, setError] = useState("");
  const [, setMessage] = useState("");

  // 상단 토스트(공통 상태 표시 – 성공 / 실패)
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success"); // "success" | "error"

  // 로그인 입력값
  const [loginUserId, setLoginUserId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // 회원가입 입력값
  const [signupUser, setSignupUser] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");

  // 비밀번호 찾기 상태
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(""); // 아이디 또는 이메일

  // ===== 구버전 랜딩 페이지 배경 패럴럭스 상태 =====
  const [parallaxPos, setParallaxPos] = useState({ x: 0, y: 0 });

  const handleBackgroundMove = (e) => {
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX - innerWidth / 2) / innerWidth;
    const y = (e.clientY - innerHeight / 2) / innerHeight;
    setParallaxPos({ x, y });
  };
  // ================================================

  // 내부 텍스트 메시지 초기화
  const resetMessages = () => {
    setError("");
    setMessage("");
  };

  // 공통 토스트 표시 함수 (성공/실패 메세지)
  const showToast = (text, type = "success") => {
    setToast(text);
    setToastType(type);

    // 3초 후 자동 제거
    setTimeout(() => {
      setToast("");
    }, 3000);
  };

  // ===================== 로그인 기능 =====================
  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!loginUserId || !loginPassword) {
      // 입력 누락 – 빨간색
      showToast("아이디와 비밀번호를 모두 입력해주세요.", "error");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: loginUserId,
          password: loginPassword,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // 로그인 성공 – 초록색
        showToast(`환영합니다 "${loginUserId}" 님`, "success");
        setError("");
        setMessage("");

        // 새로고침 로그인 유지용
        try {
          localStorage.setItem("ilji_logged_in", "1");
          localStorage.setItem("ilji_user_id", loginUserId);
        } catch (err) {
          console.warn("localStorage set error:", err);
        }

        // 3초간 보여준 뒤 대시보드 진입
        setTimeout(() => {
          if (onLoginSuccess) onLoginSuccess();
        }, 3000);
      } else {
        // 로그인 실패 – 빨간색
        const msg = data.message || "아이디 또는 비밀번호가 올바르지 않습니다.";
        showToast(msg, "error");
        setError(msg);
        setMessage("");
      }
    } catch (err) {
      console.error("login error:", err);
      showToast("서버 연결 오류 (로그인)", "error");
      setError("서버 연결 오류 (로그인)");
      setMessage("");
    }
  };

  // ===================== 회원가입 기능 =====================
  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!signupUser || !signupEmail || !signupPassword) {
      showToast("모든 회원가입 정보를 입력해주세요.", "error");
      setError("모든 회원가입 정보를 입력해주세요.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: signupUser,
          email: signupEmail,
          password: signupPassword,
        }),
      });

      const data = await res.json();

      if (data.success) {
        // 회원가입 성공 – 초록색
        showToast("정상적으로 회원가입이 완료되었습니다", "success");
        setMessage("회원가입이 완료되었습니다.");
        setError("");

        // 입력값 초기화
        setSignupUser("");
        setSignupEmail("");
        setSignupPassword("");

        // 로그인 패널로 전환
        setIsRightPanelActive(false);
      } else {
        // 회원가입 실패 – 빨간색
        const msg = data.message || "회원가입 실패";
        showToast(msg, "error");
        setError(msg);
        setMessage("");
      }
    } catch (err) {
      console.error("signup error:", err);
      showToast("서버 연결 오류 (회원가입)", "error");
      setError("서버 연결 오류 (회원가입)");
      setMessage("");
    }
  };

  // ===================== 비밀번호 찾기 기능 =====================
  const handleResetPassword = async () => {
    resetMessages();

    if (!resetTarget.trim()) {
      showToast("아이디 또는 이메일을 입력해주세요.", "error");
      setError("아이디 또는 이메일을 입력해주세요.");
      return;
    }

    try {
      const res = await fetch("http://localhost:5000/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdOrEmail: resetTarget.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        // 비번 찾기 성공 – 초록색
        const msg = data.message || "비밀번호 재설정 정보를 전송했습니다.";
        showToast(msg, "success");
        setMessage(msg);
        setError("");
        setResetTarget("");
        setIsResetOpen(false);
      } else {
        // 비번 찾기 실패 – 빨간색
        const msg =
          data.message ||
          "해당 아이디(또는 이메일)를 사용하는 사용자를 찾을 수 없습니다.";
        showToast(msg, "error");
        setError(msg);
        setMessage("");
      }
    } catch (err) {
      console.error("reset-password error:", err);
      showToast("비밀번호 재설정 요청 중 오류가 발생했습니다.", "error");
      setError("비밀번호 재설정 요청 중 오류가 발생했습니다.");
      setMessage("");
    }
  };

  return (
    <div className="login-root" onMouseMove={handleBackgroundMove}>
      {/* ==== 구버전 랜딩 페이지 초록/연두/주황 대각형 배경 ==== */}
      <div className="lp-diagonal-outer lp-green-outer">
        <div
          className="lp-diagonal-inner lp-green-inner"
          style={{
            transform: `skewX(-26deg) translate3d(${parallaxPos.x * -30}px, ${
              parallaxPos.y * -40
            }px, 0)`,
          }}
        />
      </div>

      <div className="lp-diagonal-outer lp-green-light-outer">
        <div
          className="lp-diagonal-inner lp-green-light-inner"
          style={{
            transform: `skewX(-26deg) translate3d(${parallaxPos.x * -18}px, ${
              parallaxPos.y * -24
            }px, 0)`,
          }}
        />
      </div>

      <div className="lp-diagonal-outer lp-orange-outer">
        <div
          className="lp-diagonal-inner lp-orange-inner"
          style={{
            transform: `skewX(-26deg) translate3d(${parallaxPos.x * -20}px, ${
              parallaxPos.y * -16
            }px, 0)`,
          }}
        />
      </div>
      {/* ===================================================== */}

      {/* ======================= 상단 토스트 ======================= */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "14px 32px",
            borderRadius: 14,
            backgroundColor:
              toastType === "success"
                ? "rgba(34,197,94,0.95)" // 초록색
                : "rgba(239,68,68,0.95)", // 빨간색
            color: "#ffffff",
            fontSize: 18,
            fontWeight: 700,
            boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
            zIndex: 9999,
            transition: "all 0.3s ease",
          }}
        >
          {toast}
        </div>
      )}
      {/* ============================================================ */}

      {/* 왼쪽 정보 텍스트 */}
      <div className="left-info">
        <h1>ILJI TECH</h1>
        <h3>AI 기반 월 결산 모니터링 대시보드</h3>
        <p>이상치·누락 탐지, 변동 분석을 한 화면에서 확인하세요.</p>
      </div>

      <div className="auth-frame">
        <div
          className={`container ${
            isRightPanelActive ? "right-panel-active" : ""
          }`}
        >
          {/* ================= 회원가입 폼 ================= */}
          <div className="container__form container--signup">
            <form className="form" onSubmit={handleSignUpSubmit}>
              <h2 className="form__title">Sign Up</h2>
              <input
                type="text"
                placeholder="User"
                className="input"
                value={signupUser}
                onChange={(e) => setSignupUser(e.target.value)}
              />
              <input
                type="email"
                placeholder="Email"
                className="input"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                className="input"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
              />
              <button className="btn" type="submit">
                Sign Up
              </button>
            </form>
          </div>

          {/* ================= 로그인 폼 ================= */}
          <div className="container__form container--signin">
            <form className="form" onSubmit={handleSignInSubmit}>
              <h2 className="form__title">Sign In</h2>
              <input
                type="text"
                placeholder="User ID"
                className="input"
                value={loginUserId}
                onChange={(e) => setLoginUserId(e.target.value)}
              />
              <input
                type="password"
                placeholder="Password"
                className="input"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />

              {/* 비밀번호 찾기 링크 + 입력 영역 */}
              <div
                style={{
                  width: "100%",
                  textAlign: "right",
                  marginTop: 4,
                  marginBottom: 8,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setIsResetOpen((prev) => !prev);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    fontSize: 12,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  비밀번호 찾기
                </button>
              </div>

              {isResetOpen && (
                <div style={{ width: "100%", marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="아이디 또는 이메일"
                    className="input"
                    value={resetTarget}
                    onChange={(e) => setResetTarget(e.target.value)}
                    style={{ marginBottom: 6 }}
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={handleResetPassword}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      padding: "8px 12px",
                    }}
                  >
                    비밀번호 재설정 요청
                  </button>
                </div>
              )}

              <button className="btn" type="submit">
                Sign In
              </button>
            </form>
          </div>

          {/* ================= 오버레이 ================= */}
          <div className="container__overlay">
            <div className="overlay">
              <div className="overlay__panel overlay--left">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setIsRightPanelActive(false);
                  }}
                >
                  Sign In
                </button>
              </div>

              <div className="overlay__panel overlay--right">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    resetMessages();
                    setIsRightPanelActive(true);
                  }}
                >
                  Sign Up
                </button>
              </div>
            </div>
          </div>
          {/* ============================================ */}
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
