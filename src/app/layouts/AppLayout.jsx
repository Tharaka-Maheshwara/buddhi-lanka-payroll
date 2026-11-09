import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  NavLink,
  Outlet,
  useLocation,
} from "react-router-dom";

import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  LogOut,
  Menu,
  X,
} from "lucide-react";

import { useAuth } from "../../features/auth/AuthProvider";
import { usePeriod } from "../PeriodContext";

const links = [
  ["/", "Overview", LayoutDashboard],
  ["/employees", "Employees", Users],
  ["/attendance", "Attendance", CalendarDays],
  ["/payroll", "Payroll", Wallet],
];

function Navigation({ onNavigate }) {
  return (
    <nav
      aria-label="Main navigation"
      className="flex flex-col gap-2"
    >
      {links.map(([to, label, Icon]) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          onClick={onNavigate}
          className={({ isActive }) =>
            [
              "flex items-center gap-3 rounded-xl px-4 py-3",
              "text-sm transition-colors",
              isActive
                ? "bg-[#d9ed9c] font-semibold text-[#123d34]"
                : "text-emerald-50/80 hover:bg-white/10",
            ].join(" ")
          }
        >
          <Icon size={19} aria-hidden="true" />

          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function CompanyBrand() {
  return (
    <div>
      <img
        src="/company-logo.png"
        alt="Buddhi Lanka Engineers logo"
        className="mb-5 h-16 w-24 rounded-lg bg-white p-1 object-contain"
      />

      <p className="text-lg font-bold leading-tight">
        BUDDHI LANKA
        <br />
        ENGINEERS
      </p>
    </div>
  );
}

export function AppLayout() {
  const { demo, logout } = useAuth();
  const { period, setPeriod } = usePeriod();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const menuButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const drawerRef = useRef(null);

  const pageTitle =
    links.find(([path]) =>
      path === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(path),
    )?.[1] || "Workspace";

  function closeMenu() {
    setMobileMenuOpen(false);
  }

  // Close the mobile menu after navigation.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close the drawer when switching to desktop.
  useEffect(() => {
    const media = window.matchMedia(
      "(min-width: 1024px)",
    );

    function handleResize() {
      if (media.matches) {
        setMobileMenuOpen(false);
      }
    }

    media.addEventListener("change", handleResize);

    return () => {
      media.removeEventListener("change", handleResize);
    };
  }, []);

  // Lock background scrolling and keep keyboard focus in the drawer.
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }

      if (event.key !== "Tab") return;

      const focusable = drawerRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
      );

      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;

      document.removeEventListener(
        "keydown",
        handleKeyDown,
      );

      menuButtonRef.current?.focus();
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-[#f5f7f3]">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#123d34] p-6 text-white lg:flex">
        <CompanyBrand />

        <p className="mb-5 mt-10 text-[10px] tracking-[0.18em] text-emerald-100/60">
          PAYROLL MANAGEMENT
        </p>

        <Navigation />

        <p className="mt-auto pt-10 text-xs text-emerald-100/60">
          Buddhi Lanka Engineers
        </p>
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#123d34] px-4 py-3 text-white lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/company-logo.png"
            alt="Company logo"
            className="h-10 w-14 shrink-0 rounded-md bg-white p-1 object-contain"
          />

          <div className="min-w-0">
            <p className="text-xs font-bold leading-5">
              BUDDHI LANKA ENGINEERS
            </p>

            <p className="text-xs text-emerald-100/70">
              {pageTitle}
            </p>
          </div>
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#d9ed9c]"
        >
          <Menu size={23} />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            onClick={closeMenu}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          <aside
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-[#123d34] p-6 text-white shadow-2xl"
          >
            <div className="mb-8 flex items-start justify-between gap-3">
              <CompanyBrand />

              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMenu}
                aria-label="Close navigation menu"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 hover:bg-white/10"
              >
                <X size={22} />
              </button>
            </div>

            <p className="mb-4 text-[10px] tracking-[0.18em] text-emerald-100/60">
              PAYROLL MANAGEMENT
            </p>

            <Navigation onNavigate={closeMenu} />

            <div className="mt-auto border-t border-white/10 pt-6">
              <p className="text-xs text-emerald-100/60">
                Buddhi Lanka Engineers
              </p>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <main className="min-w-0 px-4 pb-10 sm:px-6 lg:ml-60 lg:px-9 lg:pb-12">
        <header className="mb-6 border-b border-stone-200 py-4 lg:py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <span className="hidden text-sm text-stone-500 lg:block">
              Buddhi Lanka Engineers / Workspace
            </span>

            <div className="flex flex-wrap items-center justify-between gap-3 xl:justify-end">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm sm:flex-none">
                <span className="shrink-0">
                  Pay period
                </span>

                <input
                  aria-label="Pay period"
                  type="month"
                  value={period}
                  onChange={(event) => {
                    if (event.target.value) {
                      setPeriod(event.target.value);
                    }
                  }}
                  className="min-w-0 w-full max-w-[190px] rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                />
              </label>

              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-full bg-[#edf3d5] px-3 py-1 text-xs font-medium text-[#123d34]">
                  {demo ? "Demo" : "Admin"}
                </span>

                {!demo && (
                  <button
                    type="button"
                    onClick={logout}
                    aria-label="Sign out"
                    title="Sign out"
                    className="flex h-10 items-center justify-center gap-2 rounded-lg px-2 text-sm text-[#123d34] hover:bg-stone-200/60"
                  >
                    <LogOut
                      size={18}
                      aria-hidden="true"
                    />

                    <span className="hidden sm:inline">
                      Sign out
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}