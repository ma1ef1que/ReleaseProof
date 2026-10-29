import WorkspacePage from "../workspaces/WorkspacePage";

interface AccountPageProps {
  workspaceId: string | null;
  navigate: (route: "account" | "home" | `workspace/${string}`) => void;
}

function AccountPage({ workspaceId, navigate }: AccountPageProps) {
  return <WorkspacePage workspaceId={workspaceId} navigate={navigate} />;
}

export default AccountPage;
