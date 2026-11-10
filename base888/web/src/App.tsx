import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { type ReactNode } from "react";
import { I18nProvider } from "@/context/I18nProvider";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { WorkspaceProvider } from "@/context/WorkspaceContext";
import { AppShell } from "@/components/AppShell";
import { ToastViewport } from "@/components/Toast";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { EditorView } from "@/pages/EditorView";
import { SuperagentView } from "@/pages/SuperagentView";
import { PreviewPage } from "@/pages/PreviewPage";
import { CodeEditorPage } from "@/pages/CodeEditorPage";
import { AppDashboardPage } from "@/pages/AppDashboardPage";
import { AppEditorPage } from "@/pages/AppEditorPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { AgentBuilderPage } from "@/pages/AgentBuilderPage";
import { BuilderPage } from "@/pages/BuilderPage";
import { AllAppsPage, SearchPage, TemplatesPage, CommunityPage, ConnectorsPage, PartnersPage, WorkflowsPage, ChannelsPage, ArtifactsPage, CodePickerPage } from "@/pages/SimplePages";

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center muted">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}

// Full-screen workspaces (editor, code) render without the sidebar, like the
// real builder; everything else lives inside the sidebar shell.
function Authed() {
  return (
    <WorkspaceProvider>
      <Routes>
        <Route path="/apps/:appId/editor/preview" element={<EditorView />} />
        <Route path="/apps/:appId/editor" element={<EditorView />} />
        <Route path="/apps/:appId/code" element={<CodeEditorPage />} />
        <Route path="/*" element={
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="apps" element={<AllAppsPage />} />
              <Route path="search" element={<SearchPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="community" element={<CommunityPage />} />
              <Route path="connectors" element={<ConnectorsPage />} />
              <Route path="partners" element={<PartnersPage />} />
              <Route path="workflows" element={<WorkflowsPage />} />
              <Route path="channels" element={<ChannelsPage />} />
              <Route path="artifacts" element={<ArtifactsPage />} />
              <Route path="code" element={<CodePickerPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="superagent/new" element={<SuperagentView />} />
              <Route path="superagent/app/:appId" element={<SuperagentView />} />
              <Route path="apps/:appId/preview" element={<PreviewPage />} />
              <Route path="apps/:appId/dashboard" element={<AppDashboardPage />} />
              <Route path="apps/:appId/data" element={<AppEditorPage />} />
              <Route path="apps/:appId/agent" element={<AgentBuilderPage />} />
              <Route path="apps/:appId/builder" element={<BuilderPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        } />
      </Routes>
    </WorkspaceProvider>
  );
}

export default function App() {
  return (
    <I18nProvider lang="en">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<RequireAuth><Authed /></RequireAuth>} />
          </Routes>
        </BrowserRouter>
        <ToastViewport />
      </AuthProvider>
    </I18nProvider>
  );
}
