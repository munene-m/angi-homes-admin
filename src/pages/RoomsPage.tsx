import { useEffect, useMemo, useState } from 'react';
import { useAuthz } from '../contexts/AuthzContext';
import { useToast } from '../contexts/ToastContext';
import type { ApiError } from '../lib/api';
import { apiRequest } from '../lib/api';
import { permissionCodes } from '../lib/permissions';

type RoomStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';
type BedStatus = 'available' | 'occupied' | 'maintenance' | 'inactive';

type Bed = {
  id: string;
  roomId: string;
  name: string;
  code: string;
  status: BedStatus;
};

type Room = {
  id: string;
  name: string;
  code: string;
  status: RoomStatus;
  beds?: Bed[];
};

const RoomsPage = () => {
  const { can } = useAuthz();
  const { showToast } = useToast();

  const canRead = can(permissionCodes.residentsRead);
  const canWrite = can(permissionCodes.residentsUpdate);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState('');

  const [roomForm, setRoomForm] = useState({
    name: '',
    status: 'available' as RoomStatus,
  });

  const [bedForm, setBedForm] = useState({
    name: '',
    status: 'available' as BedStatus,
  });
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoomForm, setEditRoomForm] = useState({
    name: '',
    status: 'available' as RoomStatus,
  });
  const [editingBedId, setEditingBedId] = useState<string | null>(null);
  const [editBedForm, setEditBedForm] = useState({
    name: '',
    status: 'available' as BedStatus,
  });

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );

  const toApiError = (error: unknown) => error as ApiError;

  const loadRooms = async () => {
    if (!canRead) return;

    setLoading(true);
    try {
      const response = await apiRequest<{ data: Room[] }>('/api/admin/residents/rooms');
      setRooms(response.data);
      if (!selectedRoomId && response.data.length > 0) {
        setSelectedRoomId(response.data[0].id);
      }
      if (selectedRoomId && !response.data.some((room) => room.id === selectedRoomId)) {
        setSelectedRoomId(response.data[0]?.id ?? '');
      }
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRooms();
  }, [canRead]);

  const createRoom = async () => {
    if (!roomForm.name.trim()) return;

    setBusy(true);
    try {
      await apiRequest('/api/admin/residents/rooms', {
        method: 'POST',
        body: JSON.stringify(roomForm),
      });
      setRoomForm({ name: '', status: 'available' });
      showToast('Room created.', 'success');
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const createBed = async () => {
    if (!selectedRoomId || !bedForm.name.trim()) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/rooms/${encodeURIComponent(selectedRoomId)}/beds`, {
        method: 'POST',
        body: JSON.stringify(bedForm),
      });
      setBedForm({ name: '', status: 'available' });
      showToast('Bed created.', 'success');
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEditRoom = (room: Room) => {
    setEditingRoomId(room.id);
    setEditRoomForm({
      name: room.name,
      status: room.status,
    });
  };

  const saveRoom = async () => {
    if (!editingRoomId) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/rooms/${encodeURIComponent(editingRoomId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editRoomForm.name,
          status: editRoomForm.status,
        }),
      });
      showToast('Room updated.', 'success');
      setEditingRoomId(null);
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEditBed = (bed: Bed) => {
    setEditingBedId(bed.id);
    setEditBedForm({
      name: bed.name,
      status: bed.status,
    });
  };

  const saveBed = async () => {
    if (!editingBedId) return;

    setBusy(true);
    try {
      await apiRequest(`/api/admin/residents/beds/${encodeURIComponent(editingBedId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editBedForm.name,
          status: editBedForm.status,
        }),
      });
      showToast('Bed updated.', 'success');
      setEditingBedId(null);
      await loadRooms();
    } catch (error) {
      showToast(toApiError(error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Rooms & Beds</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          You do not have permission to access rooms.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-(--color-primary)">Rooms & Beds</h1>
        <p className="mt-1 text-sm text-(--color-primary)/70">
          Manage rooms and bed inventory from one place.
        </p>
      </div>

      {canWrite ? (
        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          <h2 className="text-sm font-semibold">Create Room</h2>
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <input
              placeholder="Room name"
              value={roomForm.name}
              onChange={(event) => setRoomForm((state) => ({ ...state, name: event.target.value }))}
              className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
            />
            <select
              value={roomForm.status}
              onChange={(event) =>
                setRoomForm((state) => ({ ...state, status: event.target.value as RoomStatus }))
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
              onClick={() => void createRoom()}
              disabled={busy || !roomForm.name.trim()}
              className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Add room
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-3">
          {loading ? <p className="text-sm text-(--color-primary)/70">Loading rooms...</p> : null}
          <div className="max-h-[65vh] overflow-auto">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoomId(room.id)}
                className={`mb-2 block w-full rounded-md border px-3 py-2 text-left ${
                  selectedRoomId === room.id
                    ? 'border-(--color-primary) bg-(--color-cream)'
                    : 'border-(--color-primary)/15 bg-white'
                }`}
              >
                <p className="text-sm font-medium text-(--color-primary)">
                  {room.name} ({room.code})
                </p>
                <p className="text-xs text-(--color-primary)/65">
                  {room.status} • Beds: {room.beds?.length ?? 0}
                </p>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-surface) p-4">
          {!selectedRoom ? (
            <p className="text-sm text-(--color-primary)/70">Select a room to manage its beds.</p>
          ) : (
            <>
              <h2 className="text-lg font-semibold">
                {selectedRoom.name} ({selectedRoom.code})
              </h2>
              <p className="text-xs text-(--color-primary)/65">{selectedRoom.status}</p>
              {canWrite ? (
                <div className="mt-2">
                  {editingRoomId === selectedRoom.id ? (
                    <div className="grid gap-2 md:grid-cols-4">
                      <input
                        value={editRoomForm.name}
                        onChange={(event) =>
                          setEditRoomForm((state) => ({ ...state, name: event.target.value }))
                        }
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                      />
                      <input
                        value={selectedRoom.code}
                        readOnly
                        disabled
                        className="cursor-not-allowed rounded-md border border-(--color-primary)/20 bg-(--color-primary)/5 px-3 py-2 text-sm text-(--color-primary)/65"
                      />
                      <select
                        value={editRoomForm.status}
                        onChange={(event) =>
                          setEditRoomForm((state) => ({
                            ...state,
                            status: event.target.value as RoomStatus,
                          }))
                        }
                        className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm"
                      >
                        <option value="available">Available</option>
                        <option value="occupied">Occupied</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="inactive">Inactive</option>
                      </select>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void saveRoom()} className="btn-save">
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingRoomId(null)}
                          className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" onClick={() => startEditRoom(selectedRoom)} className="btn-edit">
                      Edit room
                    </button>
                  )}
                </div>
              ) : null}

              {canWrite ? (
                <div className="mt-4 rounded-lg border border-(--color-primary)/15 p-3">
                  <h3 className="text-sm font-semibold">Create Bed</h3>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <input
                      placeholder="Bed name"
                      value={bedForm.name}
                      onChange={(event) => setBedForm((state) => ({ ...state, name: event.target.value }))}
                      className="rounded-md border border-(--color-primary)/25 px-3 py-2 text-sm outline-none focus:border-(--color-primary)"
                    />
                    <select
                      value={bedForm.status}
                      onChange={(event) =>
                        setBedForm((state) => ({ ...state, status: event.target.value as BedStatus }))
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
                      onClick={() => void createBed()}
                      disabled={busy || !bedForm.name.trim()}
                      className="rounded-md bg-(--color-primary) px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Add bed
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-2">
                {(selectedRoom.beds ?? []).map((bed) => (
                  <div key={bed.id} className="rounded-md border border-(--color-primary)/15 px-3 py-2">
                    {editingBedId === bed.id ? (
                      <div className="grid gap-2 md:grid-cols-4">
                        <input
                          value={editBedForm.name}
                          onChange={(event) =>
                            setEditBedForm((state) => ({ ...state, name: event.target.value }))
                          }
                          className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                        />
                        <input
                          value={bed.code}
                          readOnly
                          disabled
                          className="cursor-not-allowed rounded-md border border-(--color-primary)/20 bg-(--color-primary)/5 px-2 py-1 text-sm text-(--color-primary)/65"
                        />
                        <select
                          value={editBedForm.status}
                          onChange={(event) =>
                            setEditBedForm((state) => ({
                              ...state,
                              status: event.target.value as BedStatus,
                            }))
                          }
                          className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-sm"
                        >
                          <option value="available">Available</option>
                          <option value="occupied">Occupied</option>
                          <option value="maintenance">Maintenance</option>
                          <option value="inactive">Inactive</option>
                        </select>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => void saveBed()} className="btn-save">
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingBedId(null)}
                            className="rounded-md border border-(--color-primary)/25 px-2 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-(--color-primary)">
                            {bed.name} ({bed.code})
                          </p>
                          <p className="text-xs text-(--color-primary)/65">{bed.status}</p>
                        </div>
                        {canWrite ? (
                          <button type="button" onClick={() => startEditBed(bed)} className="btn-edit">
                            Edit
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
                {(selectedRoom.beds ?? []).length === 0 ? (
                  <p className="text-sm text-(--color-primary)/70">No beds in this room yet.</p>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
};

export default RoomsPage;
