import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { UserRoundPlus, X } from "lucide-react";

export function Modal({
  title,
  description,
  children,
  onClose,
  busy = false,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;

    dialog.showModal();
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      dialog.querySelector("input:not([disabled])")?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      dialog.close();
      document.body.style.overflow = previousOverflow;

      if (previousFocus instanceof HTMLElement) {
        previousFocus.focus();
      }
    };
  }, []);

  const dismiss = () => {
    if (!busy) onClose();
  };

  const handleBackdropClick = (event) => {
    if (event.target !== dialogRef.current) return;

    const rect = event.currentTarget.getBoundingClientRect();

    const outside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;

    if (outside) dismiss();
  };

  return createPortal(
    <>
      <style>{`
        .payroll-modal::backdrop {
          background: rgba(8, 30, 24, 0.62);
          backdrop-filter: blur(5px);
          -webkit-backdrop-filter: blur(5px);
        }

        .payroll-modal {
          animation: payroll-modal-enter 180ms ease-out;
        }

        .payroll-modal-content {
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #b5c5bb transparent;
        }

        .payroll-modal-content input,
        .payroll-modal-content select {
          width: 100%;
          border-radius: 9px;
          min-height: 46px;
        }

        .payroll-modal-content input:focus,
        .payroll-modal-content select:focus {
          outline: 2px solid #82aa53;
          outline-offset: 2px;
          border-color: #527e60;
        }

        .payroll-modal-close:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2) !important;
        }

        @keyframes payroll-modal-enter {
          from {
            opacity: 0;
            translate: 0 10px;
          }

          to {
            opacity: 1;
            translate: 0 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .payroll-modal {
            animation: none;
          }
        }

        @media (max-width: 480px) {
          .payroll-modal-heading {
            padding: 20px !important;
          }

          .payroll-modal-icon {
            display: none !important;
          }
        }
      `}</style>

      <dialog
        ref={dialogRef}
        className="payroll-modal"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy}
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          right: "auto",
          bottom: "auto",
          transform: "translate(-50%, -50%)",
          margin: 0,
          padding: 0,
          width: "min(720px, calc(100vw - 32px))",
          maxWidth: "none",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: "20px",
          background: "#ffffff",
          color: "#243d3a",
          boxShadow:
            "0 30px 90px rgba(4, 25, 19, 0.35), 0 8px 24px rgba(4, 25, 19, 0.15)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100dvh - 32px)",
          }}
        >
          <header
            className="payroll-modal-heading"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              flexShrink: 0,
              padding: "26px 28px",
              background: "#123d34",
              borderBottom: "4px solid #d9ed9c",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
              }}
            >
              <div
                className="payroll-modal-icon"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "52px",
                  height: "52px",
                  flexShrink: 0,
                  borderRadius: "14px",
                  background: "rgba(217, 237, 156, 0.13)",
                  border: "1px solid rgba(217, 237, 156, 0.25)",
                  color: "#d9ed9c",
                }}
              >
                <UserRoundPlus size={25} strokeWidth={1.7} />
              </div>

              <div>
                <div
                  style={{
                    marginBottom: "7px",
                    color: "#c1d69c",
                    fontSize: "10px",
                    fontWeight: 600,
                    letterSpacing: "1.7px",
                  }}
                >
                  BUDDHI LANKA ENGINEERS
                </div>

                <h2
                  id={titleId}
                  style={{
                    margin: 0,
                    color: "#ffffff",
                    fontSize: "24px",
                    fontWeight: 650,
                    lineHeight: 1.3,
                  }}
                >
                  {title}
                </h2>

                {description && (
                  <p
                    id={descriptionId}
                    style={{
                      margin: "8px 0 0",
                      color: "#c3d5cc",
                      fontSize: "13px",
                      lineHeight: 1.6,
                    }}
                  >
                    {description}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              className="payroll-modal-close"
              aria-label="Close employee form"
              disabled={busy}
              onClick={dismiss}
              style={{
                display: "grid",
                placeItems: "center",
                width: "34px",
                height: "34px",
                flexShrink: 0,
                padding: 0,
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: "10px",
                background: "rgba(255,255,255,0.08)",
                color: "#ffffff",
                cursor: busy ? "wait" : "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              <X size={18} />
            </button>
          </header>

          <div
            className="payroll-modal-content"
            style={{
              minHeight: 0,
              background: "#ffffff",
            }}
          >
            {children}
          </div>
        </div>
      </dialog>
    </>,
    document.body,
  );
}