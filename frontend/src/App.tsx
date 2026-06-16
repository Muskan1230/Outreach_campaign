import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'

// Auth
import { AuthProvider } from './features/auth/context/AuthContext'
import { ProtectedRoute } from './features/auth/components/ProtectedRoute'
import { LoginPage } from './features/auth/pages/LoginPage'

// Shared layout
import { AppNav } from './components/layout/AppNav'

// Feature: Campaigns
import { CampaignListPage } from './features/campaigns/pages/CampaignListPage'
import { CampaignSetupPage } from './features/campaigns/pages/CampaignSetupPage'

// Feature: Forms
import { ApplicationFormsListPage } from './features/forms/pages/FormsListPage'
import { ApplicationFormEditorPage } from './features/forms/pages/FormEditorPage'
import { ApplicationFormPreviewPage } from './features/forms/pages/FormPreviewPage'

// Feature: Workflow / Templates
import { TemplateListPage } from './features/workflow/pages/TemplateListPage'
import { TemplateEditorPage } from './features/workflow/pages/TemplateEditorPage'
import { CampaignOutreachPage } from './features/workflow/pages/CampaignOutreachPage'
import { CampaignFormStagePage } from './features/workflow/pages/CampaignFormStagePage'
import { CampaignDistributePage } from './features/workflow/pages/CampaignDistributePage'

// Feature: Applicants
import { CampaignApplicantsPage } from './features/applicants/pages/CampaignApplicantsPage'
import { ApplicantDetailPage } from './features/applicants/pages/ApplicantDetailPage'

// Feature: Analytics
import { CampaignAnalyticsPage } from './features/analytics/pages/CampaignAnalyticsPage'
import { RecruiterNotificationsPage } from './features/notifications/pages/RecruiterNotificationsPage'

// Feature: Candidate Apply (public — no auth required)
import { CandidateApplyPage } from './features/candidate-apply/pages/CandidateApplyPage'
import { ApplicationStatusPage } from './features/candidate-apply/pages/ApplicationStatusPage'
import { TrackRedirectPage } from './features/candidate-apply/pages/TrackRedirectPage'

function AppShell() {
  const location = useLocation()
  const isCandidateView =
    location.pathname.startsWith('/apply') ||
    location.pathname.startsWith('/track')
  const isLoginView = location.pathname === '/login'

  return (
    <>
      {!isCandidateView && !isLoginView ? <AppNav /> : null}
      <Routes>
        {/* ── Public routes ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/apply/:id" element={<CandidateApplyPage />} />
        <Route path="/apply/status" element={<ApplicationStatusPage />} />
        <Route path="/apply/status/:mobile" element={<ApplicationStatusPage />} />
        {/* Tracking redirect: records click + redirects to apply form */}
        <Route path="/track/:linkId" element={<TrackRedirectPage />} />

        {/* ── Protected recruiter routes ── */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Navigate to="/campaigns" replace />} />
          <Route path="/campaigns" element={<CampaignListPage />} />
          <Route path="/campaigns/new" element={<CampaignSetupPage mode="create" />} />
          <Route path="/campaigns/:id" element={<CampaignSetupPage mode="edit" />} />
          <Route path="/campaigns/:id/outreach" element={<CampaignOutreachPage />} />
          <Route path="/campaigns/:id/form" element={<CampaignFormStagePage />} />
          <Route path="/campaigns/:id/distribute" element={<CampaignDistributePage />} />
          <Route path="/campaigns/:id/applicants" element={<CampaignApplicantsPage />} />
          <Route path="/campaigns/:id/applicants/:appId" element={<ApplicantDetailPage />} />
          <Route path="/campaigns/:id/analytics" element={<CampaignAnalyticsPage />} />
          <Route path="/templates" element={<TemplateListPage />} />
          <Route path="/templates/new" element={<TemplateEditorPage mode="create" />} />
          <Route path="/templates/:id" element={<TemplateEditorPage mode="edit" />} />
          <Route path="/forms" element={<ApplicationFormsListPage />} />
          <Route path="/forms/new" element={<ApplicationFormEditorPage mode="create" />} />
          <Route path="/forms/:id" element={<ApplicationFormEditorPage mode="edit" />} />
          <Route path="/forms/:id/preview" element={<ApplicationFormPreviewPage />} />
          <Route path="/notifications" element={<RecruiterNotificationsPage />} />
          <Route path="*" element={<Navigate to="/campaigns" replace />} />
        </Route>
      </Routes>
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
