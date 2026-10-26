import { createSlice } from "@reduxjs/toolkit";
//import { dummyWorkspaces } from "../assets/assets";
import { createAsyncThunk } from "@reduxjs/toolkit";
import api from "../configs/api";

export const fetchWorkspaces = createAsyncThunk("workspace/fetchWorkspaces", async () => {
    try {
        const {data} = await api.get("/workspaces");
        return data.workspaces || [];
    } catch (error) {
        console.error(
            "Failed to fetch workspaces:",
            error.response?.status,
            error.response?. data || error.message
        );

        throw error;
    }
});

const initialState = {
    workspaces: [],
    currentWorkspace: null,
    loading: false,
    error: null,
};

const workspaceSlice = createSlice({
    name: "workspace",
    initialState,
    reducers: {
        setWorkspaces: (state, action) => {
            state.workspaces = action.payload;
        },
        setCurrentWorkspace: (state, action) => {
            localStorage.setItem("currentWorkspaceId", action.payload);
            state.currentWorkspace = state.workspaces.find((w) => w.id === action.payload);
        },
        addWorkspace: (state, action) => {
            state.workspaces.push(action.payload);

            // set current workspace to the new workspace
            if (state.currentWorkspace?.id !== action.payload.id) {
                state.currentWorkspace = action.payload;
            }
        },
        updateWorkspace: (state, action) => {
            state.workspaces = state.workspaces.map((w) =>
                w.id === action.payload.id ? action.payload : w
            );

            // if current workspace is updated, set it to the updated workspace
            if (state.currentWorkspace?.id === action.payload.id) {
                state.currentWorkspace = action.payload;
            }
        },
        deleteWorkspace: (state, action) => {
            state.workspaces = state.workspaces.filter((w) => w.id !== action.payload);
            if (state.currentWorkspace?.id === action.payload) {
                state.currentWorkspace = state.workspaces[0] || null;
                localStorage.removeItem("currentWorkspaceId");
            }
        },
        addProject: (state, action) => {
            if (!state.currentWorkspace) return;
            const workspaceId = state.currentWorkspace.id;
            state.workspaces = state.workspaces.map((workspace) => {
                if (workspace.id !== workspaceId) return workspace;
                const projects = workspace.projects || [];
                return projects.some((project) => project.id === action.payload.id)
                    ? workspace
                    : { ...workspace, projects: [...projects, action.payload] };
            });
            state.currentWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId);
        },
        addTask: (state, action) => {
            if (!state.currentWorkspace) return;
            const workspaceId = state.currentWorkspace.id;
            state.workspaces = state.workspaces.map((workspace) => {
                if (workspace.id !== workspaceId) return workspace;
                return {
                    ...workspace,
                    projects: (workspace.projects || []).map((project) => {
                        if (project.id !== action.payload.projectId) return project;
                        const tasks = project.tasks || [];
                        return tasks.some((task) => task.id === action.payload.id)
                            ? project
                            : { ...project, tasks: [...tasks, action.payload] };
                    }),
                };
            });
            state.currentWorkspace = state.workspaces.find((workspace) => workspace.id === workspaceId);
        },
        updateTask: (state, action) => {
            state.currentWorkspace.projects = state.currentWorkspace.projects.map((p) => {
                if (p.id === action.payload.projectId) {
                    p.tasks = p.tasks.map((t) =>
                        t.id === action.payload.id ? action.payload : t
                    );
                }
                return p;
            });
            // find workspace and project by id and update task in it
            state.workspaces = state.workspaces.map((w) =>
                w.id === state.currentWorkspace.id ? {
                    ...w, projects: w.projects.map((p) =>
                        p.id === action.payload.projectId ? {
                            ...p, tasks: p.tasks.map((t) =>
                                t.id === action.payload.id ? action.payload : t
                            )
                        } : p
                    )
                } : w
            );
        },
        deleteTask: (state, action) => {
            state.currentWorkspace.projects = state.currentWorkspace.projects.map((p) => {
                p.tasks = p.tasks.filter((t) => !action.payload.includes(t.id));
                return p;
            });
            // find workspace and project by id and delete task from it
            state.workspaces = state.workspaces.map((w) =>
                w.id === state.currentWorkspace.id ? {
                    ...w, projects: w.projects.map((p) =>
                        p.id === action.payload.projectId ? {
                            ...p, tasks: p.tasks.filter((t) => !action.payload.includes(t.id))
                        } : p
                    )
                } : w
            );
        }

    },
    extraReducers: (builder) => {
        builder.addCase(fetchWorkspaces.pending, (state) => {
            state.loading = true;
            state.error = null;
        });
        builder.addCase(fetchWorkspaces.fulfilled, (state, action) => {
            state.workspaces = action.payload;
            if (action.payload.length > 0) {
                const localStorageCurrentWorkspaceId = localStorage.getItem("currentWorkspaceId");
                if (localStorageCurrentWorkspaceId) {
                    const findworkspace = action.payload.find((w) => w.id === localStorageCurrentWorkspaceId);
                    if (findworkspace) {
                        state.currentWorkspace = findworkspace;
                    } else {
                        state.currentWorkspace = action.payload[0];
                    }
                } else {
                    state.currentWorkspace = action.payload[0];
                }
            }
            state.loading = false;
            state.error = null;
        });
        builder.addCase(fetchWorkspaces.rejected, (state, action) => {
            state.loading = false;
            state.error = action.error?.message || "Failed to fetch workspaces";
        });
    }
});

export const { setWorkspaces, setCurrentWorkspace, addWorkspace, updateWorkspace, deleteWorkspace, addProject, addTask, updateTask, deleteTask } = workspaceSlice.actions;
export default workspaceSlice.reducer;
