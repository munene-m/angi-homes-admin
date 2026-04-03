import {
  BadgeDollarSign,
  ChartNoAxesColumn,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Cog,
  LayoutDashboard,
  LogOut,
  ShoppingBasket,
  ShoppingCart,
  Stethoscope,
  UserCog,
  Users,
  UserSquare2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthz } from '../contexts/AuthzContext';
import { authClient } from '../lib/auth-client';
import { permissionCodes } from '../lib/permissions';

type NavItem = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  section: 'Care' | 'Operations' | 'System';
  permission?: string;
};

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, section: 'Care' },
  {
    label: 'Residents',
    to: '/dashboard/residents',
    icon: UserSquare2,
    section: 'Care',
    permission: permissionCodes.residentsRead,
  },
  {
    label: 'Appointments',
    to: '/dashboard/appointments',
    icon: Stethoscope,
    section: 'Care',
    permission: permissionCodes.appointmentsRead,
  },
  {
    label: 'Visits',
    to: '/dashboard/visits',
    icon: Users,
    section: 'Care',
    permission: permissionCodes.visitsRead,
  },
  {
    label: 'Rooms & Beds',
    to: '/dashboard/rooms',
    icon: ShoppingBasket,
    section: 'Operations',
    permission: permissionCodes.residentsRead,
  },
  {
    label: 'Admissions',
    to: '/dashboard/admissions',
    icon: ShoppingCart,
    section: 'Operations',
    permission: permissionCodes.residentsRead,
  },
  {
    label: 'User Management',
    to: '/dashboard/users',
    icon: ChartNoAxesColumn,
    section: 'System',
    permission: permissionCodes.usersRead,
  },
  {
    label: 'Staff Management',
    to: '/dashboard/staff',
    icon: UserCog,
    section: 'System',
    permission: permissionCodes.staffRead,
  },
  { label: 'Settings', to: '/dashboard/settings', icon: Cog, section: 'System' },
];

const AdminLayout = () => {
  const { data: session } = authClient.useSession();
  const { can } = useAuthz();
  const navigate = useNavigate();

  const [expanded, setExpanded] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.permission || can(item.permission)),
    [can],
  );

  const grouped = useMemo(
    () => ({
      Care: visibleNavItems.filter((item) => item.section === 'Care'),
      Operations: visibleNavItems.filter((item) => item.section === 'Operations'),
      System: visibleNavItems.filter((item) => item.section === 'System'),
    }),
    [visibleNavItems],
  );

  const handleSignOut = async () => {
    setIsSigningOut(true);
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate('/login', { replace: true }),
      },
    });
    setIsSigningOut(false);
  };

  return (
    <div className="min-h-dvh bg-(--color-cream) text-(--color-primary)">
      <div className="mx-auto flex w-full max-w-412.5 gap-3 p-3 md:gap-4 md:p-4">
        <aside
          className={`hidden min-h-[calc(100dvh-2rem)] rounded-2xl border border-(--color-primary)/20 bg-(--color-surface) py-5 shadow-sm transition-[width,padding] duration-300 ease-out md:flex md:flex-col ${
            expanded ? 'w-70 px-4' : 'w-18.5 px-2'
          }`}
        >
          <div className={`flex items-center ${expanded ? 'justify-between' : 'justify-center'}`}>
            <div
              className={`flex items-center gap-2 text-(--color-primary) transition-opacity duration-200 ${
                expanded ? 'opacity-100' : 'pointer-events-none w-0 opacity-0'
              }`}
            >
              <BadgeDollarSign className="size-5" />
              <span className="whitespace-nowrap text-2xl font-semibold">Angi Homes</span>
            </div>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-(--color-cream) text-(--color-primary) hover:bg-(--color-cream)/80"
            >
              {expanded ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {(Object.keys(grouped) as Array<keyof typeof grouped>).map((section) =>
              grouped[section].length > 0 ? (
                <section key={section}>
                  <h3
                    className={`mb-2 text-xs font-semibold uppercase tracking-wide text-(--color-primary)/45 transition-all duration-200 ${
                      expanded ? 'opacity-100' : 'h-0 overflow-hidden opacity-0'
                    }`}
                  >
                    {section}
                  </h3>
                  <ul className="space-y-1.5">
                    {grouped[section].map((item) => {
                      const Icon = item.icon;
                      return (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            title={!expanded ? item.label : undefined}
                            className={({ isActive }) =>
                              `flex items-center rounded-lg py-2 text-sm transition ${
                                expanded ? 'gap-2.5 px-3' : 'justify-center px-2'
                              } ${
                                isActive
                                  ? 'bg-(--color-cream) font-medium text-(--color-primary)'
                                  : 'text-(--color-primary)/70 hover:bg-(--color-cream)/70'
                              }`
                            }
                          >
                            <Icon className="size-4 shrink-0" />
                            <span
                              className={`whitespace-nowrap transition-all duration-200 ${
                                expanded
                                  ? 'opacity-100'
                                  : 'pointer-events-none w-0 overflow-hidden opacity-0'
                              }`}
                            >
                              {item.label}
                            </span>
                          </NavLink>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null,
            )}
          </div>

          <div className="mt-auto border-t border-(--color-primary)/15 pt-4">
            <div className={`flex items-center ${expanded ? 'gap-2' : 'justify-center'}`}>
              <CircleUserRound className="size-7 shrink-0 text-(--color-primary)/55" />
              <div
                className={`min-w-0 transition-all duration-200 ${
                  expanded ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden opacity-0'
                }`}
              >
                <p className="truncate text-sm font-semibold text-(--color-primary)">
                  {session?.user?.name || 'User'}
                </p>
                <p className="truncate text-xs text-(--color-primary)/60">{session?.user?.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={isSigningOut}
              title={!expanded ? 'Log out' : undefined}
              className={`mt-4 inline-flex items-center rounded-lg text-sm text-(--color-primary)/80 transition hover:bg-(--color-cream)/70 disabled:opacity-60 ${
                expanded ? 'w-full gap-2 px-3 py-2' : 'w-full justify-center px-2 py-2'
              }`}
            >
              <LogOut className="size-4 shrink-0" />
              <span
                className={`whitespace-nowrap transition-all duration-200 ${
                  expanded ? 'opacity-100' : 'pointer-events-none w-0 overflow-hidden opacity-0'
                }`}
              >
                {isSigningOut ? 'Logging out...' : 'Log out'}
              </span>
            </button>
          </div>
        </aside>

        <main className="min-h-[calc(100dvh-1.5rem)] flex-1 rounded-2xl border border-(--color-primary)/20 bg-(--color-surface) p-4 shadow-sm md:min-h-[calc(100dvh-2rem)] md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
