import { CalendarDays, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useUser } from "@clerk/react";
import { Link, useSearchParams } from "react-router-dom";

export default function MyTasks() {
    const { currentWorkspace } = useSelector((state) => state.workspace);
    const { user } = useUser();
    const [searchParams] = useSearchParams();
    const overdueOnly = searchParams.get("filter") === "overdue";

    const tasks = useMemo(() => {
        const workspaceTasks = (currentWorkspace?.projects || []).flatMap((project) =>
            (project.tasks || []).map((task) => ({ ...task, projectName: project.name }))
        );
        return workspaceTasks
            .filter((task) => overdueOnly || task.assigneeId === user?.id || task.assignee?.id === user?.id)
            .filter((task) => !overdueOnly || (
                task.status !== "DONE" && task.due_date && new Date(task.due_date) < new Date()
            ))
            .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    }, [currentWorkspace, user?.id, overdueOnly]);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-white">
                    {overdueOnly ? "Overdue Tasks" : "My Tasks"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                    {overdueOnly ? "Overdue tasks in " : "Tasks assigned to you in "}
                    {currentWorkspace?.name || "this workspace"}
                </p>
            </div>

            {tasks.length === 0 ? (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-10 text-center text-gray-500 dark:text-zinc-400">
                    <ClipboardList className="size-8 mx-auto mb-3" />
                    <p>{overdueOnly ? "You have no overdue tasks." : "No tasks are assigned to you yet."}</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map((task) => (
                        <Link
                            key={task.id}
                            to={`/taskDetails?projectId=${task.projectId}&taskId=${task.id}`}
                            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 hover:border-blue-400 dark:hover:border-blue-500 transition"
                        >
                            <div className="min-w-0">
                                <h2 className="font-medium text-gray-900 dark:text-white truncate">{task.title}</h2>
                                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">{task.projectName}</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-zinc-400">
                                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-1">{task.status.replace("_", " ")}</span>
                                {task.due_date && (
                                    <span className="flex items-center gap-1">
                                        <CalendarDays className="size-3.5" />
                                        {format(new Date(task.due_date), "dd MMM yyyy")}
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
