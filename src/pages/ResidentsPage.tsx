import { useEffect, useMemo, useRef, useState } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';
import { isValidEmail, isValidKenyanPhone, normalizeKenyanPhone } from '../lib/validation';

type ResidentStatus = 'pending' | 'active' | 'discharged' | 'deceased';
type AdmissionStatus = 'planned' | 'admitted' | 'discharged' | 'cancelled';
type AllocationStatus = 'active' | 'transferred' | 'ended';
type MobilityStatus = 'independent' | 'assisted' | 'wheelchair' | 'bedridden';
type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';
type BedStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';

type Resident = {
  id: string;
  residentNumber: string;
  firstName: string;
  lastName: string;
  status: ResidentStatus;
  phoneNumber: string | null;
  email: string | null;
  notes: string | null;
  isArchived: boolean;
};

type ResidentContact = {
  id: string;
  fullName: string;
  relationship: string | null;
  phoneNumber: string | null;
  email: string | null;
  type: string;
};

type ResidentAdmission = {
  id: string;
  admissionDate: string;
  status: AdmissionStatus;
  careLevel: string | null;
  source?: string | null;
  dischargeDate?: string | null;
};

type ResidentAllocation = {
  id: string;
  roomId: string;
  bedId: string;
  allocationDate: string;
  status: AllocationStatus;
  releaseDate?: string | null;
  reason?: string | null;
  notes?: string | null;
  room?: { name: string; code: string };
  bed?: { name: string; code: string };
};

type ResidentMedicalProfile = {
  bloodGroup?: string | null;
  genotype?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  mobilityStatus?: MobilityStatus | null;
  careNotes?: string | null;
};

type ResidentDetail = Resident & {
  contacts: ResidentContact[];
  admissions: ResidentAdmission[];
  roomAllocations: ResidentAllocation[];
  medicalProfile: ResidentMedicalProfile | null;
};

type Room = {
  id: string;
  name: string;
  code: string;
  status: RoomStatus;
  beds?: Bed[];
};

type Bed = {
  id: string;
  roomId: string;
  name: string;
  code: string;
  status: BedStatus;
};

type Tab = 'overview' | 'contacts' | 'admissions' | 'allocations' | 'medical' | 'rooms';

const ResidentsPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.residentsRead);
  const canCreate = can(permissionCodes.residentsCreate);
  const canUpdate = can(permissionCodes.residentsUpdate);
  const canDelete = can(permissionCodes.residentsDelete);

  const [residents, setResidents] = useState<Resident[]>([]);
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  const [residentDetail, setResidentDetail] = useState<ResidentDetail | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [loadingResidents, setLoadingResidents] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [createResidentOpen, setCreateResidentOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [blockingAction, setBlockingAction] = useState(false);

  const [newResident, setNewResident] = useState({
    firstName: '',
    lastName: '',
    status: 'pending' as ResidentStatus,
    phoneNumber: '',
    email: '',
  });

  const [editResident, setEditResident] = useState({
    firstName: '',
    lastName: '',
    status: 'pending' as ResidentStatus,
    phoneNumber: '',
    email: '',
    notes: '',
  });

  const [newContact, setNewContact] = useState({
    fullName: '',
    relationship: '',
    phoneNumber: '',
    email: '',
    type: 'family',
  });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState({
    fullName: '',
    relationship: '',
    phoneNumber: '',
    email: '',
    type: 'family',
  });

  const [newAdmission, setNewAdmission] = useState({
    admissionDate: '',
    status: 'planned' as AdmissionStatus,
    source: '',
    careLevel: '',
  });
  const [editingAdmissionId, setEditingAdmissionId] = useState<string | null>(null);
  const [admissionDraft, setAdmissionDraft] = useState({
    status: 'planned' as AdmissionStatus,
    careLevel: '',
    source: '',
  });

  const [medicalDraft, setMedicalDraft] = useState<ResidentMedicalProfile>({
    bloodGroup: '',
    genotype: '',
    allergies: '',
    chronicConditions: '',
    mobilityStatus: undefined,
    careNotes: '',
  });

  const [newAllocation, setNewAllocation] = useState({
    roomId: '',
    bedId: '',
    allocationDate: '',
    status: 'active' as AllocationStatus,
  });
  const [allocations, setAllocations] = useState<ResidentAllocation[]>([]);

  const [newRoom, setNewRoom] = useState({
    name: '',
    status: 'available' as RoomStatus,
  });

  const [selectedRoomForBed, setSelectedRoomForBed] = useState('');
  const [newBed, setNewBed] = useState({
    name: '',
    status: 'available' as BedStatus,
  });
  const residentsLoadRequestRef = useRef(0);

  const selectedRoomBeds = useMemo(
    () => rooms.find((room) => room.id === newAllocation.roomId)?.beds ?? [],
    [newAllocation.roomId, rooms],
  );

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomForBed),
    [rooms, selectedRoomForBed],
  );

  const toApiError = (error: unknown) => error as ApiError;

  const loadRooms = async () => {
    if (!canRead) return;

    try {
      const response = await apiRequest<{ data: Room[] }>('/api/admin/residents/rooms');
      setRooms(response.data);
      if (!selectedRoomForBed && response.data.length > 0) {
        setSelectedRoomForBed(response.data[0].id);
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  };

  const loadResidents = async (
    options?: { ignoreFilters?: boolean; preferredResidentId?: string | null },
  ) => {
    if (!canRead) return;

    const requestId = ++residentsLoadRequestRef.current;
    setLoadingResidents(true);
    try {
      const response = await apiRequest<{ data: Resident[] }>('/api/admin/residents?includeArchived=true');

      const q = search.trim().toLowerCase();
      const filteredResidents = options?.ignoreFilters
        ? response.data
        : response.data.filter((resident) => {
            if (!includeArchived && resident.isArchived) return false;
            if (statusFilter && resident.status !== statusFilter) return false;
            if (!q) return true;
            const fullName = `${resident.firstName} ${resident.lastName}`.toLowerCase();
            return (
              fullName.includes(q) ||
              resident.firstName.toLowerCase().includes(q) ||
              resident.lastName.toLowerCase().includes(q) ||
              resident.residentNumber.toLowerCase().includes(q)
            );
          });

      if (requestId !== residentsLoadRequestRef.current) {
        return;
      }

      setResidents(filteredResidents);

      const preferredId = options?.preferredResidentId;
      if (preferredId && filteredResidents.some((resident) => resident.id === preferredId)) {
        setSelectedResidentId(preferredId);
        return;
      }

      if (filteredResidents.length === 0) {
        setSelectedResidentId(null);
        setResidentDetail(null);
      } else if (!selectedResidentId || !filteredResidents.find((x) => x.id === selectedResidentId)) {
        setSelectedResidentId(filteredResidents[0].id);
      }
    } catch (error) {
      if (requestId !== residentsLoadRequestRef.current) {
        return;
      }
      showToast(toApiError(error).message, 'error');
    } finally {
      if (requestId === residentsLoadRequestRef.current) {
        setLoadingResidents(false);
      }
    }
  };

  const loadResidentDetail = async (residentId: string) => {
    setLoadingDetail(true);
    try {
      const response = await apiRequest<{ data: ResidentDetail }>(
        `/api/admin/residents/${encodeURIComponent(residentId)}`,
      );
      setResidentDetail(response.data);
      setAllocations(response.data.roomAllocations ?? []);

      setEditResident({
        firstName: response.data.firstName,
        lastName: response.data.lastName,
        status: response.data.status,
        phoneNumber: response.data.phoneNumber ?? '',
        email: response.data.email ?? '',
        notes: response.data.notes ?? '',
      });

      setMedicalDraft({
        bloodGroup: response.data.medicalProfile?.bloodGroup ?? '',
        genotype: response.data.medicalProfile?.genotype ?? '',
        allergies: response.data.medicalProfile?.allergies ?? '',
        chronicConditions: response.data.medicalProfile?.chronicConditions ?? '',
        mobilityStatus: response.data.medicalProfile?.mobilityStatus ?? undefined,
        careNotes: response.data.medicalProfile?.careNotes ?? '',
      });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadResidents();
    }, 240);
    return () => window.clearTimeout(timer);
  }, [search, statusFilter, includeArchived, canRead]);

  useEffect(() => {
    if (!selectedResidentId || !canRead) return;
    void loadResidentDetail(selectedResidentId);
  }, [selectedResidentId, canRead]);

  useEffect(() => {
    void loadRooms();
  }, [canRead]);

  const loadAllocations = async (residentId: string) => {
    try {
      const response = await apiRequest<{ data: ResidentAllocation[] }>(
        `/api/admin/residents/${encodeURIComponent(residentId)}/allocations`,
      );
      setAllocations(response.data);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    }
  };

  useEffect(() => {
    if (!selectedResidentId || activeTab !== 'allocations' || !canRead) return;
    void loadAllocations(selectedResidentId);
  }, [selectedResidentId, activeTab, canRead]);

  const refreshEverything = async () => {
    await Promise.all([
      loadResidents(),
      loadRooms(),
      selectedResidentId ? loadResidentDetail(selectedResidentId) : Promise.resolve(),
    ]);
  };

  const createResident = async () => {
    if (newResident.email.trim() && !isValidEmail(newResident.email)) {
      showToast('Enter a valid email address.', 'error');
      return;
    }

    if (newResident.phoneNumber.trim() && !isValidKenyanPhone(newResident.phoneNumber)) {
      showToast('Phone number must be a valid Kenyan number.', 'error');
      return;
    }

    setBlockingAction(true);
    try {
      const response = await apiRequest<{ data: ResidentDetail }>('/api/admin/residents', {
        method: 'POST',
        body: JSON.stringify({
          ...newResident,
          phoneNumber: newResident.phoneNumber
            ? normalizeKenyanPhone(newResident.phoneNumber)
            : undefined,
          email: newResident.email || undefined,
        }),
      });
      setNewResident({
        firstName: '',
        lastName: '',
        status: 'pending',
        phoneNumber: '',
        email: '',
      });
      setSearch('');
      setStatusFilter('');
      setIncludeArchived(false);
      setCreateResidentOpen(false);
      showToast('Resident created.', 'success');
      await loadResidents({ ignoreFilters: true, preferredResidentId: response.data.id });
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const saveResident = async () => {
    if (!selectedResidentId) return;

    if (editResident.email.trim() && !isValidEmail(editResident.email)) {
      showToast('Enter a valid email address.', 'error');
      return;
    }

    if (editResident.phoneNumber.trim() && !isValidKenyanPhone(editResident.phoneNumber)) {
      showToast('Phone number must be a valid Kenyan number.', 'error');
      return;
    }

    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(selectedResidentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editResident.firstName,
          lastName: editResident.lastName,
          status: editResident.status,
          phoneNumber: editResident.phoneNumber
            ? normalizeKenyanPhone(editResident.phoneNumber)
            : undefined,
          email: editResident.email || undefined,
          notes: editResident.notes || undefined,
        }),
      });
      showToast('Resident updated.', 'success');
      await loadResidents();
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const archiveResident = async () => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(selectedResidentId)}`, {
        method: 'DELETE',
      });
      showToast('Resident archived.', 'success');
      await loadResidents();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
      setConfirmArchiveOpen(false);
    }
  };

  const unarchiveResident = async () => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${encodeURIComponent(selectedResidentId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ isArchived: false }),
      });
      showToast('Resident unarchived.', 'success');
      await loadResidents();
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const addContact = async () => {
    if (!selectedResidentId) return;

    if (newContact.email.trim() && !isValidEmail(newContact.email)) {
      showToast('Enter a valid email address for contact.', 'error');
      return;
    }

    if (newContact.phoneNumber.trim() && !isValidKenyanPhone(newContact.phoneNumber)) {
      showToast('Contact phone must be a valid Kenyan number.', 'error');
      return;
    }

    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          ...newContact,
          phoneNumber: newContact.phoneNumber
            ? normalizeKenyanPhone(newContact.phoneNumber)
            : undefined,
        }),
      });
      setNewContact({
        fullName: '',
        relationship: '',
        phoneNumber: '',
        email: '',
        type: 'family',
      });
      showToast('Contact added.', 'success');
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/contacts/${contactId}`, {
        method: 'DELETE',
      });
      showToast('Contact deleted.', 'success');
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const startEditContact = (contact: ResidentContact) => {
    setEditingContactId(contact.id);
    setContactDraft({
      fullName: contact.fullName,
      relationship: contact.relationship ?? '',
      phoneNumber: contact.phoneNumber ?? '',
      email: contact.email ?? '',
      type: contact.type || 'family',
    });
  };

  const saveContact = async () => {
    if (!selectedResidentId || !editingContactId) return;

    if (contactDraft.email.trim() && !isValidEmail(contactDraft.email)) {
      showToast('Enter a valid email address for contact.', 'error');
      return;
    }

    if (contactDraft.phoneNumber.trim() && !isValidKenyanPhone(contactDraft.phoneNumber)) {
      showToast('Contact phone must be a valid Kenyan number.', 'error');
      return;
    }

    setBlockingAction(true);
    try {
      await apiRequest(
        `/api/admin/residents/${selectedResidentId}/contacts/${encodeURIComponent(editingContactId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            fullName: contactDraft.fullName,
            relationship: contactDraft.relationship || undefined,
            phoneNumber: contactDraft.phoneNumber
              ? normalizeKenyanPhone(contactDraft.phoneNumber)
              : undefined,
            email: contactDraft.email || undefined,
            type: contactDraft.type || undefined,
          }),
        },
      );
      showToast('Contact updated.', 'success');
      setEditingContactId(null);
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const addAdmission = async () => {
    if (!selectedResidentId || !newAdmission.admissionDate) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/admissions`, {
        method: 'POST',
        body: JSON.stringify({
          admissionDate: new Date(newAdmission.admissionDate).toISOString(),
          status: newAdmission.status,
          source: newAdmission.source || undefined,
          careLevel: newAdmission.careLevel || undefined,
        }),
      });
      setNewAdmission({
        admissionDate: '',
        status: 'planned',
        source: '',
        careLevel: '',
      });
      showToast('Admission added.', 'success');
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const deleteAdmission = async (admissionId: string) => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/admissions/${admissionId}`, {
        method: 'DELETE',
      });
      showToast('Admission deleted.', 'success');
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const startEditAdmission = (admission: ResidentAdmission) => {
    setEditingAdmissionId(admission.id);
    setAdmissionDraft({
      status: admission.status,
      careLevel: admission.careLevel ?? '',
      source: admission.source ?? '',
    });
  };

  const saveAdmission = async () => {
    if (!selectedResidentId || !editingAdmissionId) return;

    setBlockingAction(true);
    try {
      await apiRequest(
        `/api/admin/residents/${selectedResidentId}/admissions/${encodeURIComponent(editingAdmissionId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: admissionDraft.status,
            careLevel: admissionDraft.careLevel || undefined,
            source: admissionDraft.source || undefined,
          }),
        },
      );
      showToast('Admission updated.', 'success');
      setEditingAdmissionId(null);
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const saveAllocation = async () => {
    if (!selectedResidentId || !newAllocation.roomId || !newAllocation.bedId || !newAllocation.allocationDate) {
      return;
    }
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          roomId: newAllocation.roomId,
          bedId: newAllocation.bedId,
          allocationDate: new Date(newAllocation.allocationDate).toISOString(),
          status: newAllocation.status,
        }),
      });
      setNewAllocation({
        roomId: '',
        bedId: '',
        allocationDate: '',
        status: 'active',
      });
      showToast('Allocation saved.', 'success');
      await refreshEverything();
      await loadAllocations(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const updateAllocationStatus = async (allocationId: string, status: AllocationStatus) => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(
        `/api/admin/residents/${selectedResidentId}/allocations/${encodeURIComponent(allocationId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      );
      showToast('Allocation updated.', 'success');
      await loadAllocations(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const saveMedicalProfile = async () => {
    if (!selectedResidentId) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/${selectedResidentId}/medical-profile`, {
        method: 'PUT',
        body: JSON.stringify({
          bloodGroup: medicalDraft.bloodGroup || undefined,
          genotype: medicalDraft.genotype || undefined,
          allergies: medicalDraft.allergies || undefined,
          chronicConditions: medicalDraft.chronicConditions || undefined,
          mobilityStatus: medicalDraft.mobilityStatus || undefined,
          careNotes: medicalDraft.careNotes || undefined,
        }),
      });
      showToast('Medical profile saved.', 'success');
      await loadResidentDetail(selectedResidentId);
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const createRoom = async () => {
    setBlockingAction(true);
    try {
      await apiRequest('/api/admin/residents/rooms', {
        method: 'POST',
        body: JSON.stringify(newRoom),
      });
      setNewRoom({ name: '', status: 'available' });
      showToast('Room created.', 'success');
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  const createBed = async () => {
    if (!selectedRoomForBed) return;
    setBlockingAction(true);
    try {
      await apiRequest(`/api/admin/residents/rooms/${selectedRoomForBed}/beds`, {
        method: 'POST',
        body: JSON.stringify(newBed),
      });
      setNewBed({ name: '', status: 'available' });
      showToast('Bed created.', 'success');
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBlockingAction(false);
    }
  };

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Residents</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to access resident records.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-(--color-primary)">Residents</h1>
          <p className="mt-1 text-sm text-(--color-primary)/70">
            Manage resident profiles, contacts, admissions, allocations, and medical details.
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setCreateResidentOpen((prev) => !prev)}
            className="rounded-lg bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white hover:bg-(--color-primary)/90"
          >
            {createResidentOpen ? 'Close form' : 'New resident'}
          </button>
        ) : null}
      </div>

      {createResidentOpen ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-lg font-semibold">Create Resident</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input
              placeholder="First name"
              value={newResident.firstName}
              onChange={(event) =>
                setNewResident((state) => ({ ...state, firstName: event.target.value }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              placeholder="Last name"
              value={newResident.lastName}
              onChange={(event) =>
                setNewResident((state) => ({ ...state, lastName: event.target.value }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={newResident.status}
              onChange={(event) =>
                setNewResident((state) => ({
                  ...state,
                  status: event.target.value as ResidentStatus,
                }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            >
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="discharged">Discharged</option>
              <option value="deceased">Deceased</option>
            </select>
            <input
              type="tel"
              placeholder="Phone"
              value={newResident.phoneNumber}
              onChange={(event) =>
                setNewResident((state) => ({ ...state, phoneNumber: event.target.value }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <input
              type="email"
              placeholder="Email"
              value={newResident.email}
              onChange={(event) =>
                setNewResident((state) => ({ ...state, email: event.target.value }))
              }
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
          </div>
          <button
            type="button"
            onClick={() => void createResident()}
            disabled={
              blockingAction ||
              !newResident.firstName.trim() ||
              !newResident.lastName.trim()
            }
            className="mt-3 rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {blockingAction ? 'Saving...' : 'Create resident'}
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <aside className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-3">
          <div className="grid gap-2">
            <input
              placeholder="Search residents..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
              >
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="discharged">Discharged</option>
                <option value="deceased">Deceased</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs text-(--color-primary)/75">
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(event) => setIncludeArchived(event.target.checked)}
                />
                Archived
              </label>
            </div>
          </div>

          <div className="mt-3 max-h-[560px] overflow-auto">
            {loadingResidents ? <p className="text-sm text-(--color-primary)/70">Loading...</p> : null}
            {residents.map((resident) => (
              <button
                key={resident.id}
                type="button"
                onClick={() => setSelectedResidentId(resident.id)}
                className={`mb-2 block w-full rounded-md border px-3 py-2 text-left ${
                  selectedResidentId === resident.id
                    ? 'border-(--color-primary) bg-(--color-cream)'
                    : 'border-(--color-primary)/15 bg-white'
                }`}
              >
                <p className="text-sm font-medium text-(--color-primary)">
                  {resident.firstName} {resident.lastName}
                </p>
                <p className="text-xs text-(--color-primary)/70">
                  {resident.residentNumber} • {resident.status}
                  {resident.isArchived ? ' • archived' : ''}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          {!selectedResidentId ? (
            <p className="text-sm text-(--color-primary)/70">Select a resident to continue.</p>
          ) : loadingDetail ? (
            <p className="text-sm text-(--color-primary)/70">Loading resident details...</p>
          ) : residentDetail ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold text-(--color-primary)">
                    {residentDetail.firstName} {residentDetail.lastName}
                  </h2>
                  <p className="text-sm text-(--color-primary)/70">
                    {residentDetail.residentNumber} • {residentDetail.status}
                    {residentDetail.isArchived ? ' • archived' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmArchiveOpen(true)}
                      className="btn-delete px-3 py-2 text-sm"
                    >
                      Archive resident
                    </button>
                  ) : null}
                  {canUpdate && residentDetail.isArchived ? (
                    <button
                      type="button"
                      onClick={() => void unarchiveResident()}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm text-white hover:bg-(--color-primary)/90"
                    >
                      Unarchive resident
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {([
                  ['overview', 'Overview'],
                  ['contacts', 'Contacts'],
                  ['admissions', 'Admissions'],
                  ['allocations', 'Allocations'],
                  ['medical', 'Medical'],
                ] as Array<[Tab, string]>).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      activeTab === key
                        ? 'bg-(--color-primary) text-white'
                        : 'bg-(--color-cream) text-(--color-primary)'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-(--color-primary)/60">
                Room and bed setup is managed under Operations {'>'} Rooms & Beds.
              </p>

              {activeTab === 'overview' ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <input
                    value={editResident.firstName}
                    onChange={(event) =>
                      setEditResident((state) => ({ ...state, firstName: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <input
                    value={editResident.lastName}
                    onChange={(event) =>
                      setEditResident((state) => ({ ...state, lastName: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <select
                    value={editResident.status}
                    onChange={(event) =>
                      setEditResident((state) => ({
                        ...state,
                        status: event.target.value as ResidentStatus,
                      }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="discharged">Discharged</option>
                    <option value="deceased">Deceased</option>
                  </select>
                  <input
                    type="tel"
                    value={editResident.phoneNumber}
                    onChange={(event) =>
                      setEditResident((state) => ({ ...state, phoneNumber: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    placeholder="Phone"
                  />
                  <input
                    type="email"
                    value={editResident.email}
                    onChange={(event) =>
                      setEditResident((state) => ({ ...state, email: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    placeholder="Email"
                  />
                  <textarea
                    value={editResident.notes}
                    onChange={(event) =>
                      setEditResident((state) => ({ ...state, notes: event.target.value }))
                    }
                    className="md:col-span-2 min-h-24 rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    placeholder="Notes"
                  />
                  {canUpdate ? (
                    <button
                      type="button"
                      onClick={() => void saveResident()}
                      disabled={blockingAction}
                      className="w-fit rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Save resident
                    </button>
                  ) : null}
                </div>
              ) : null}

              {activeTab === 'contacts' ? (
                <div className="mt-4 grid gap-2">
                  <div className="grid gap-2 md:grid-cols-5">
                    <input
                      placeholder="Full name"
                      value={newContact.fullName}
                      onChange={(event) =>
                        setNewContact((state) => ({ ...state, fullName: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      placeholder="Relationship"
                      value={newContact.relationship}
                      onChange={(event) =>
                        setNewContact((state) => ({ ...state, relationship: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={newContact.phoneNumber}
                      onChange={(event) =>
                        setNewContact((state) => ({ ...state, phoneNumber: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={newContact.email}
                      onChange={(event) =>
                        setNewContact((state) => ({ ...state, email: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <button
                      type="button"
                      disabled={!canUpdate || !newContact.fullName.trim()}
                      onClick={() => void addContact()}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Add contact
                    </button>
                  </div>
                  {residentDetail.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center justify-between rounded-md border border-(--color-primary)/15 px-3 py-2"
                    >
                      {editingContactId === contact.id ? (
                        <div className="grid w-full gap-2 md:grid-cols-5">
                          <input
                            value={contactDraft.fullName}
                            onChange={(event) =>
                              setContactDraft((state) => ({ ...state, fullName: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <input
                            value={contactDraft.relationship}
                            onChange={(event) =>
                              setContactDraft((state) => ({ ...state, relationship: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <input
                            value={contactDraft.phoneNumber}
                            onChange={(event) =>
                              setContactDraft((state) => ({ ...state, phoneNumber: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <input
                            value={contactDraft.email}
                            onChange={(event) =>
                              setContactDraft((state) => ({ ...state, email: event.target.value }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveContact()}
                              className="btn-save"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingContactId(null)}
                              className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-(--color-primary)/85">
                            {contact.fullName} • {contact.relationship || '-'} • {contact.phoneNumber || '-'}
                          </p>
                          {canUpdate ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEditContact(contact)}
                                className="btn-edit"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteContact(contact.id)}
                                className="btn-delete"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {activeTab === 'admissions' ? (
                <div className="mt-4 grid gap-2">
                  <div className="grid gap-2 md:grid-cols-5">
                    <input
                      type="datetime-local"
                      value={newAdmission.admissionDate}
                      onChange={(event) =>
                        setNewAdmission((state) => ({ ...state, admissionDate: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <select
                      value={newAdmission.status}
                      onChange={(event) =>
                        setNewAdmission((state) => ({
                          ...state,
                          status: event.target.value as AdmissionStatus,
                        }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="planned">Planned</option>
                      <option value="admitted">Admitted</option>
                      <option value="discharged">Discharged</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <input
                      placeholder="Source"
                      value={newAdmission.source}
                      onChange={(event) =>
                        setNewAdmission((state) => ({ ...state, source: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <input
                      placeholder="Care level"
                      value={newAdmission.careLevel}
                      onChange={(event) =>
                        setNewAdmission((state) => ({ ...state, careLevel: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <button
                      type="button"
                      disabled={!canUpdate || !newAdmission.admissionDate}
                      onClick={() => void addAdmission()}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Add admission
                    </button>
                  </div>
                  {residentDetail.admissions.map((admission) => (
                    <div
                      key={admission.id}
                      className="flex items-center justify-between rounded-md border border-(--color-primary)/15 px-3 py-2"
                    >
                      {editingAdmissionId === admission.id ? (
                        <div className="grid w-full gap-2 md:grid-cols-5">
                          <select
                            value={admissionDraft.status}
                            onChange={(event) =>
                              setAdmissionDraft((state) => ({
                                ...state,
                                status: event.target.value as AdmissionStatus,
                              }))
                            }
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          >
                            <option value="planned">Planned</option>
                            <option value="admitted">Admitted</option>
                            <option value="discharged">Discharged</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <input
                            value={admissionDraft.careLevel}
                            onChange={(event) =>
                              setAdmissionDraft((state) => ({ ...state, careLevel: event.target.value }))
                            }
                            placeholder="Care level"
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <input
                            value={admissionDraft.source}
                            onChange={(event) =>
                              setAdmissionDraft((state) => ({ ...state, source: event.target.value }))
                            }
                            placeholder="Source"
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                          />
                          <div className="md:col-span-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => void saveAdmission()}
                              className="btn-save"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAdmissionId(null)}
                              className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-(--color-primary)/85">
                            {new Date(admission.admissionDate).toLocaleString()} • {admission.status} • {admission.careLevel || '-'}
                          </p>
                          {canUpdate ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => startEditAdmission(admission)}
                                className="btn-edit"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteAdmission(admission.id)}
                                className="btn-delete"
                              >
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}

              {activeTab === 'allocations' ? (
                <div className="mt-4 grid gap-2">
                  <p className="text-xs text-(--color-primary)/65">
                    Assign a bed by selecting room, bed, and allocation date, then click `Assign bed`.
                  </p>
                  <div className="grid gap-2 md:grid-cols-5">
                    <select
                      value={newAllocation.roomId}
                      onChange={(event) =>
                        setNewAllocation((state) => ({ ...state, roomId: event.target.value, bedId: '' }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="">Select room</option>
                      {rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name} ({room.code})
                        </option>
                      ))}
                    </select>
                    <select
                      value={newAllocation.bedId}
                      onChange={(event) =>
                        setNewAllocation((state) => ({ ...state, bedId: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="">Select bed</option>
                      {selectedRoomBeds.map((bed) => (
                        <option key={bed.id} value={bed.id}>
                          {bed.name} ({bed.code}) - {bed.status}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={newAllocation.allocationDate}
                      onChange={(event) =>
                        setNewAllocation((state) => ({ ...state, allocationDate: event.target.value }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <select
                      value={newAllocation.status}
                      onChange={(event) =>
                        setNewAllocation((state) => ({
                          ...state,
                          status: event.target.value as AllocationStatus,
                        }))
                      }
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    >
                      <option value="active">Active</option>
                      <option value="transferred">Transferred</option>
                      <option value="ended">Ended</option>
                    </select>
                    <button
                      type="button"
                      disabled={
                        !canUpdate ||
                        !newAllocation.roomId ||
                        !newAllocation.bedId ||
                        !newAllocation.allocationDate
                      }
                      onClick={() => void saveAllocation()}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Assign bed
                    </button>
                  </div>
                  {allocations.map((allocation) => (
                    <div
                      key={allocation.id}
                      className="flex items-center justify-between rounded-md border border-(--color-primary)/15 px-3 py-2 text-sm text-(--color-primary)/85"
                    >
                      <p>
                        {(allocation.room?.name || allocation.roomId) + ' • ' +
                          (allocation.bed?.name || allocation.bedId) + ' • ' +
                          allocation.status}
                      </p>
                      {canUpdate ? (
                        <select
                          value={allocation.status}
                          onChange={(event) =>
                            void updateAllocationStatus(
                              allocation.id,
                              event.target.value as AllocationStatus,
                            )
                          }
                          className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-xs"
                        >
                          <option value="active">active</option>
                          <option value="transferred">transferred</option>
                          <option value="ended">ended</option>
                        </select>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {activeTab === 'medical' ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  <input
                    placeholder="Blood group"
                    value={medicalDraft.bloodGroup || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({ ...state, bloodGroup: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <input
                    placeholder="Genotype"
                    value={medicalDraft.genotype || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({ ...state, genotype: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <input
                    placeholder="Allergies"
                    value={medicalDraft.allergies || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({ ...state, allergies: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <input
                    placeholder="Chronic conditions"
                    value={medicalDraft.chronicConditions || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({ ...state, chronicConditions: event.target.value }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  <select
                    value={medicalDraft.mobilityStatus || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({
                        ...state,
                        mobilityStatus: (event.target.value || undefined) as MobilityStatus | undefined,
                      }))
                    }
                    className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  >
                    <option value="">Mobility status</option>
                    <option value="independent">Independent</option>
                    <option value="assisted">Assisted</option>
                    <option value="wheelchair">Wheelchair</option>
                    <option value="bedridden">Bedridden</option>
                  </select>
                  <textarea
                    placeholder="Care notes"
                    value={medicalDraft.careNotes || ''}
                    onChange={(event) =>
                      setMedicalDraft((state) => ({ ...state, careNotes: event.target.value }))
                    }
                    className="md:col-span-2 min-h-24 rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                  />
                  {canUpdate ? (
                    <button
                      type="button"
                      onClick={() => void saveMedicalProfile()}
                      className="w-fit rounded-md bg-(--color-primary) px-3.5 py-2 text-sm font-medium text-white"
                    >
                      Save medical profile
                    </button>
                  ) : null}
                </div>
              ) : null}

              {activeTab === 'rooms' ? (
                <div className="mt-4 grid gap-4">
                  <div className="rounded-lg border border-(--color-primary)/15 p-3">
                    <h3 className="text-sm font-semibold">Create Room</h3>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <input
                        placeholder="Room name"
                        value={newRoom.name}
                        onChange={(event) =>
                          setNewRoom((state) => ({ ...state, name: event.target.value }))
                        }
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                      />
                      <select
                        value={newRoom.status}
                        onChange={(event) =>
                          setNewRoom((state) => ({
                            ...state,
                            status: event.target.value as RoomStatus,
                          }))
                        }
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <button
                        type="button"
                        disabled={!canUpdate || !newRoom.name.trim()}
                        onClick={() => void createRoom()}
                        className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Add room
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-(--color-primary)/15 p-3">
                    <h3 className="text-sm font-semibold">Create Bed</h3>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <select
                        value={selectedRoomForBed}
                        onChange={(event) => setSelectedRoomForBed(event.target.value)}
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                      >
                        <option value="">Select room</option>
                        {rooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.name} ({room.code})
                          </option>
                        ))}
                      </select>
                      <input
                        placeholder="Bed name"
                        value={newBed.name}
                        onChange={(event) => setNewBed((state) => ({ ...state, name: event.target.value }))}
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                      />
                      <button
                        type="button"
                        disabled={!canUpdate || !selectedRoomForBed || !newBed.name.trim()}
                        onClick={() => void createBed()}
                        className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Add bed
                      </button>
                    </div>
                    {selectedRoom ? (
                      <p className="mt-2 text-xs text-(--color-primary)/70">
                        Existing beds in selected room: {selectedRoom.beds?.length || 0}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    {rooms.map((room) => (
                      <div key={room.id} className="rounded-md border border-(--color-primary)/15 p-3">
                        <p className="text-sm font-medium">
                          {room.name} ({room.code}) • {room.status}
                        </p>
                        <p className="mt-1 text-xs text-(--color-primary)/70">
                          Beds: {room.beds?.length || 0}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-(--color-primary)/70">Resident not found.</p>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmArchiveOpen}
        title="Archive Resident"
        description="This resident will be hidden from active lists. Continue?"
        confirmLabel="Archive"
        destructive
        loading={blockingAction}
        onCancel={() => setConfirmArchiveOpen(false)}
        onConfirm={() => {
          void archiveResident();
        }}
      />
    </section>
  );
};

export default ResidentsPage;
