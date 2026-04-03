import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuthz } from '../contexts/AuthzContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';

type ResidentStatus = 'pending' | 'active' | 'discharged' | 'deceased';
type VisitStatus = 'scheduled' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'missed';
type BedStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';

type Resident = { status: ResidentStatus; isArchived: boolean };
type Visit = { status: VisitStatus };
type Appointment = { status: AppointmentStatus };
type Room = { beds?: Array<{ status: BedStatus }> };

type DashboardState = {
  residents: Resident[];
  usersCount: number;
  appointments: Appointment[];
  visits: Visit[];
  rooms: Room[];
};

const defaultDashboardState: DashboardState = {
  residents: [],
  usersCount: 0,
  appointments: [],
  visits: [],
  rooms: [],
};

const countBy = <T extends string>(values: T[]) =>
  values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});

const toChartData = (input: Record<string, number>) =>
  Object.entries(input).map(([name, value]) => ({ name, value }));

const chartTooltipStyle = {
  backgroundColor: '#ffffff',
  border: '1px solid rgba(0,48,73,0.18)',
  borderRadius: '10px',
  color: '#003049',
};

const DashboardHomePage = () => {
  const { can } = useAuthz();
  const [data, setData] = useState<DashboardState>(defaultDashboardState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      setError(null);
      try {
        const [residentsResponse, usersResponse, appointmentsResponse, visitsResponse, roomsResponse] =
          await Promise.all([
            can(permissionCodes.residentsRead)
              ? apiRequest<{ data: Resident[] }>('/api/admin/residents?includeArchived=true')
              : Promise.resolve({ data: [] }),
            can(permissionCodes.usersRead)
              ? apiRequest<{ data: unknown[] }>('/api/admin/users')
              : Promise.resolve({ data: [] }),
            can(permissionCodes.appointmentsRead)
              ? apiRequest<{ data: Appointment[] }>('/api/admin/appointments')
              : Promise.resolve({ data: [] }),
            can(permissionCodes.visitsRead)
              ? apiRequest<{ data: Visit[] }>('/api/admin/visits')
              : Promise.resolve({ data: [] }),
            can(permissionCodes.residentsRead)
              ? apiRequest<{ data: Room[] }>('/api/admin/residents/rooms')
              : Promise.resolve({ data: [] }),
          ]);

        setData({
          residents: residentsResponse.data,
          usersCount: usersResponse.data.length,
          appointments: appointmentsResponse.data,
          visits: visitsResponse.data,
          rooms: roomsResponse.data,
        });
      } catch (requestError) {
        const typed = requestError as ApiError;
        setError(typed.message);
      } finally {
        setLoading(false);
      }
    };

    void loadSummary();
  }, [can]);

  const flattenedBeds = useMemo(
    () => data.rooms.flatMap((room) => room.beds ?? []),
    [data.rooms],
  );

  const metrics = useMemo(() => {
    const activeResidents = data.residents.filter((resident) => resident.status === 'active').length;
    const archivedResidents = data.residents.filter((resident) => resident.isArchived).length;
    const occupiedBeds = flattenedBeds.filter((bed) => bed.status === 'occupied').length;
    const totalBeds = flattenedBeds.length;
    const bedOccupancy = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    return {
      residents: data.residents.length,
      activeResidents,
      archivedResidents,
      usersCount: data.usersCount,
      appointments: data.appointments.length,
      visits: data.visits.length,
      totalRooms: data.rooms.length,
      totalBeds,
      bedOccupancy,
    };
  }, [data, flattenedBeds]);

  const residentStatusChart = useMemo(
    () => toChartData(countBy(data.residents.map((resident) => resident.status))),
    [data.residents],
  );
  const visitStatusChart = useMemo(
    () => toChartData(countBy(data.visits.map((visit) => visit.status))),
    [data.visits],
  );
  const appointmentStatusChart = useMemo(
    () => toChartData(countBy(data.appointments.map((appointment) => appointment.status))),
    [data.appointments],
  );
  const bedStatusChart = useMemo(
    () => toChartData(countBy(flattenedBeds.map((bed) => bed.status))),
    [flattenedBeds],
  );

  const cards = [
    { label: 'Residents', value: metrics.residents, visible: can(permissionCodes.residentsRead) },
    {
      label: 'Active Residents',
      value: metrics.activeResidents,
      visible: can(permissionCodes.residentsRead),
    },
    {
      label: 'Archived Residents',
      value: metrics.archivedResidents,
      visible: can(permissionCodes.residentsRead),
    },
    { label: 'Users', value: metrics.usersCount, visible: can(permissionCodes.usersRead) },
    {
      label: 'Appointments',
      value: metrics.appointments,
      visible: can(permissionCodes.appointmentsRead),
    },
    { label: 'Visits', value: metrics.visits, visible: can(permissionCodes.visitsRead) },
    { label: 'Rooms', value: metrics.totalRooms, visible: can(permissionCodes.residentsRead) },
    { label: 'Beds', value: metrics.totalBeds, visible: can(permissionCodes.residentsRead) },
    {
      label: 'Bed Occupancy',
      value: `${metrics.bedOccupancy}%`,
      visible: can(permissionCodes.residentsRead),
    },
  ];

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold text-(--color-primary)">Dashboard</h1>
      <p className="mt-1 text-sm text-(--color-primary)/70">
        Live operational snapshot across residents, visits, appointments, and room capacity.
      </p>

      {error ? (
        <p className="rounded-lg bg-(--color-cream) px-3 py-2 text-sm text-(--color-primary)">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {cards
          .filter((card) => card.visible)
          .map((card) => (
            <article
              key={card.label}
              className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) px-4 py-4"
            >
              <p className="text-xs uppercase tracking-wide text-(--color-primary)/60">
                {card.label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-(--color-primary)">
                {loading ? '...' : card.value}
              </p>
            </article>
          ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">Resident Status</h2>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={residentStatusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,48,73,0.12)" />
                <XAxis dataKey="name" tick={{ fill: '#003049', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#003049', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#003049" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">Visits by Status</h2>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={visitStatusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,48,73,0.12)" />
                <XAxis dataKey="name" tick={{ fill: '#003049', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#003049', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#33658a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">Appointments by Status</h2>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={appointmentStatusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,48,73,0.12)" />
                <XAxis dataKey="name" tick={{ fill: '#003049', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#003049', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#588157" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold text-(--color-primary)">Bed Inventory Status</h2>
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bedStatusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,48,73,0.12)" />
                <XAxis dataKey="name" tick={{ fill: '#003049', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#003049', fontSize: 12 }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="value" fill="#b08968" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DashboardHomePage;
