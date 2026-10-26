import { useState, useEffect } from 'react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { loadTheme } from '../features/themeSlice'
import { Loader2Icon } from 'lucide-react'
import { SignIn, useAuth, CreateOrganization, useOrganizationList } from '@clerk/react'
import { fetchWorkspaces } from '../features/workspaceSlice'
import { configureApiAuth } from '../configs/api'

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const { workspaces } = useSelector((state) => state.workspace)
    const dispatch = useDispatch();
    const { isLoaded, isSignedIn, getToken } = useAuth();
    const { userMemberships, isLoaded: orgsLoaded, setActive } = useOrganizationList({
        userMemberships: true,
    });

    const clerkOrgs = userMemberships?.data ?? [];
    const clerkOrgCount = clerkOrgs.length;
    const [holdCreateOrg, setHoldCreateOrg] = useState(false);

    // Configure API auth with Clerk token
    useEffect(() => {
        if (getToken) {
            configureApiAuth(getToken);
        }
    }, [getToken]);

    // Initial load of theme
    useEffect(() => {
        dispatch(loadTheme())
    }, [dispatch])

    // Sync Clerk orgs into the database, then load workspaces
    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;

        // Only fetch workspaces if we have organizations
        if (clerkOrgCount > 0) {
            dispatch(fetchWorkspaces());
        }
    }, [isLoaded, isSignedIn, clerkOrgCount, dispatch]);

    useEffect(() => {
        if (!orgsLoaded || !isSignedIn) return;
        if (clerkOrgCount > 0) {
            setHoldCreateOrg(false);
            return;
        }

        // Give Clerk's membership list a moment to settle on reload before
        // showing the onboarding form. This avoids flashing it for existing orgs.
        const timer = window.setTimeout(() => setHoldCreateOrg(true), 800);
        return () => window.clearTimeout(timer);
    }, [orgsLoaded, isSignedIn, clerkOrgCount]);

    useEffect(() => {
        if (!orgsLoaded || clerkOrgCount === 0 || !setActive) return;

        const storedId = localStorage.getItem("currentWorkspaceId");
        const match = clerkOrgs.find(({ organization }) => organization.id === storedId);
        const organizationId = match?.organization.id || clerkOrgs[0]?.organization.id;

        if (organizationId) {
            setActive({ organization: organizationId });
        }
    }, [orgsLoaded, clerkOrgCount, clerkOrgs, setActive]);

    if (!isLoaded || (isSignedIn && !orgsLoaded)) {
        return (
            <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
                <Loader2Icon className="size-7 text-blue-500 animate-spin" />
            </div>
        )
    }

    if (!isSignedIn) {
        return (
            <div className='flex items-center justify-center h-screen bg-white dark:bg-zinc-950'>
                <SignIn
                    routing="hash"
                    withSignUp
                    fallbackRedirectUrl="/"
                    signUpProps={{
                        forceRedirectUrl: "/",
                        afterSignUpUrl: "/",
                    }}
                    appearance={{
                        elements: {
                            form: {
                                gap: '1rem',
                            },
                        },
                    }}
                />
            </div>
        )
    }

    if (holdCreateOrg) {
        return (
            <div className='min-h-screen flex flex-col justify-center items-center bg-white dark:bg-zinc-950 gap-4'>
                <CreateOrganization
                    skipInvitationScreen={false}
                    afterCreateOrganizationUrl="/"
                />
                {clerkOrgCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setHoldCreateOrg(false)}
                        className="px-4 py-2 text-sm rounded bg-blue-600 text-white"
                    >
                        Continue to workspace
                    </button>
                )}
            </div>
        )
    }

    if (workspaces.length === 0) {
        return (
            <div className='flex flex-col items-center justify-center h-screen bg-white dark:bg-zinc-950 gap-3'>
                <Loader2Icon className="size-7 text-blue-500 animate-spin" />
                <p className="text-sm text-gray-500 dark:text-zinc-400">Syncing your workspace…</p>
            </div>
        )
    }

    return (
        <div className="flex bg-white dark:bg-zinc-950 text-gray-900 dark:text-slate-100">
            <Sidebar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
            <div className="flex-1 flex flex-col h-screen">
                <Navbar isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen} />
                <div className="flex-1 h-full p-6 xl:p-10 xl:px-16 overflow-y-scroll">
                    <Outlet />
                </div>
            </div>
        </div>
    )
}

export default Layout
