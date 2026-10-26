import { useState, useRef, useEffect } from "react";
import { AlertTriangle, ChevronDown, Check, Plus, Trash2, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { deleteWorkspace, setCurrentWorkspace } from "../features/workspaceSlice";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/react";
import toast from "react-hot-toast";
import api from "../configs/api";
//import { dummyWorkspaces } from "../assets/assets";
import { useOrganizationList, useClerk } from "@clerk/react";

function WorkspaceDropdown() {

    const { setActive, userMemberships, isLoaded } = useOrganizationList({userMemberships: true});

    const {openCreateOrganization} = useClerk();
    const { user } = useUser();

    const { workspaces } = useSelector((state) => state.workspace);
    const currentWorkspace = useSelector((state) => state.workspace?.currentWorkspace || null);
    const [isOpen, setIsOpen] = useState(false);
    const [deletingWorkspaceId, setDeletingWorkspaceId] = useState(null);
    const [workspaceToDelete, setWorkspaceToDelete] = useState(null);
    const [deleteError, setDeleteError] = useState("");
    const dropdownRef = useRef(null);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const onSelectWorkspace = (organizationId) => {
        setActive({organization: organizationId});
        dispatch(setCurrentWorkspace(organizationId))
        setIsOpen(false);
        navigate('/')
    }

    const handleDeleteWorkspace = async () => {
        if (!workspaceToDelete || deletingWorkspaceId) return;
        const organization = workspaceToDelete;
        setDeleteError("");
        setDeletingWorkspaceId(organization.id);
        try {
            await api.delete(`/workspaces/${organization.id}`);
            dispatch(deleteWorkspace(organization.id));
            if (localStorage.getItem("currentWorkspaceId") === organization.id) {
                localStorage.removeItem("currentWorkspaceId");
            }
            toast.success("Workspace deleted");
            window.location.reload();
        } catch (error) {
            const apiMessage = error?.response?.data?.message;
            const requestUrl = `${error?.config?.baseURL || ""}${error?.config?.url || ""}`;
            setDeleteError(
                apiMessage || (error?.response?.status === 404
                    ? `The API returned 404 for ${requestUrl}. Check that the API server is running the updated workspace routes.`
                    : error.message || "Could not delete workspace")
            );
            setDeletingWorkspaceId(null);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (currentWorkspace && isLoaded) {
            setActive({organization: currentWorkspace.id});
        }
    }, [currentWorkspace, isLoaded, setActive]);

    return (
        <div className="relative m-4" ref={dropdownRef}>
            <button onClick={() => setIsOpen(prev => !prev)} className="w-full flex items-center justify-between p-3 h-auto text-left rounded hover:bg-gray-100 dark:hover:bg-zinc-800" >
                <div className="flex items-center gap-3">
                    <img src={currentWorkspace?.image_url} alt={currentWorkspace?.name} className="w-8 h-8 rounded shadow" />
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800 dark:text-white text-sm truncate">
                            {currentWorkspace?.name || "Select Workspace"}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                            {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
                        </p>
                    </div>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-zinc-400 flex-shrink-0" />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-64 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded shadow-lg top-full left-0">
                    <div className="p-2">
                        <p className="text-xs text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2 px-2">
                            Workspaces
                        </p>
                        {(userMemberships?.data ?? []).map(({ organization }) => {
                            const workspace = workspaces.find((item) => item.id === organization.id);
                            const canDelete = workspace?.ownerId === user?.id;
                            return (
                            <div key={organization.id} onClick={() => onSelectWorkspace(organization.id)} className="flex items-center gap-3 p-2 cursor-pointer rounded hover:bg-gray-100 dark:hover:bg-zinc-800" >
                                <img src={organization.imageUrl} alt={organization.name} className="w-6 h-6 rounded" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-white truncate">
                                        {organization.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
                                        {organization.membersCount || 0} members
                                    </p>
                                </div>
                                {currentWorkspace?.id === organization.id && (
                                    <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                )}
                                {canDelete && (
                                    <button
                                        type="button"
                                        aria-label={`Delete ${organization.name}`}
                                        disabled={Boolean(deletingWorkspaceId)}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setDeleteError("");
                                            setWorkspaceToDelete(organization);
                                        }}
                                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                                    >
                                        <Trash2 className="size-4" />
                                    </button>
                                )}
                            </div>
                        )})}
                    </div>

                    <hr className="border-gray-200 dark:border-zinc-700" />

                    <div onClick={() => {openCreateOrganization(); setIsOpen(false)}} className="p-2 cursor-pointer rounded group hover:bg-gray-100 dark:hover:bg-zinc-800" >
                        <p className="flex items-center text-xs gap-2 my-1 w-full text-blue-600 dark:text-blue-400 group-hover:text-blue-500 dark:group-hover:text-blue-300">
                            <Plus className="w-4 h-4" /> Create Workspace
                        </p>
                    </div>
                </div>
            )}

            {workspaceToDelete && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget && !deletingWorkspaceId) {
                            setWorkspaceToDelete(null);
                            setDeleteError("");
                        }
                    }}
                >
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-workspace-title"
                        className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
                    >
                        <div className="flex items-start gap-4">
                            <div className="rounded-full bg-red-100 dark:bg-red-950 p-3 text-red-600 dark:text-red-400">
                                <AlertTriangle className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="delete-workspace-title" className="text-lg font-semibold text-zinc-900 dark:text-white">
                                    Delete workspace?
                                </h2>
                                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                                    Delete <strong>{workspaceToDelete.name}</strong> and all its projects, tasks, and discussions? This can’t be undone.
                                </p>
                            </div>
                            <button
                                type="button"
                                aria-label="Close dialog"
                                disabled={Boolean(deletingWorkspaceId)}
                                onClick={() => { setWorkspaceToDelete(null); setDeleteError(""); }}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
                            >
                                <X className="size-5" />
                            </button>
                        </div>

                        {deleteError && (
                            <p role="alert" className="mt-4 rounded-md bg-red-50 dark:bg-red-950/50 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                                {deleteError}
                            </p>
                        )}

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                type="button"
                                disabled={Boolean(deletingWorkspaceId)}
                                onClick={() => { setWorkspaceToDelete(null); setDeleteError(""); }}
                                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={Boolean(deletingWorkspaceId)}
                                onClick={handleDeleteWorkspace}
                                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                            >
                                {deletingWorkspaceId ? "Deleting…" : "Delete workspace"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default WorkspaceDropdown;
