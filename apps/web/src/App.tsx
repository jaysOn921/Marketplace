import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
import { RequireAuth } from './components/RequireAuth';
import { AccountPage } from './pages/account/AccountPage';
import { MyListingsPage } from './pages/account/MyListingsPage';
import { AdminListingsPage } from './pages/admin/AdminListingsPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminTicketPage, AdminTicketsPage } from './pages/admin/AdminTicketsPage';
import { AuditPage } from './pages/admin/AuditPage';
import { CategoriesPage } from './pages/admin/CategoriesPage';
import { DashboardPage } from './pages/admin/DashboardPage';
import { FaqAdminPage } from './pages/admin/FaqAdminPage';
import { RatesPage } from './pages/admin/RatesPage';
import { ReportsPage } from './pages/admin/ReportsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ReviewQueuePage } from './pages/admin/ReviewQueuePage';
import { ContactPage } from './pages/help/ContactPage';
import { HelpArticlePage } from './pages/help/HelpArticlePage';
import { TicketPage } from './pages/support/TicketPage';
import { TicketsPage } from './pages/support/TicketsPage';
import { SellerProfilePage } from './pages/account/SellerProfilePage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ConverterPage } from './pages/ConverterPage';
import { HelpPage } from './pages/HelpPage';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { EditListingPage, NewListingPage } from './pages/listings/ListingFormPage';
import { ListingPage } from './pages/listings/ListingPage';
import { MessagesPage } from './pages/messages/MessagesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrderPage } from './pages/orders/OrderPage';
import { OrdersPage } from './pages/orders/OrdersPage';
import { SearchPage } from './pages/SearchPage';
import { SellPage } from './pages/SellPage';
import { ShopPage } from './pages/ShopPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="help/contact" element={<ContactPage />} />
        <Route path="help/:slug" element={<HelpArticlePage />} />
        <Route path="support/tickets/:id" element={<TicketPage />} />
        <Route
          path="support/tickets"
          element={
            <RequireAuth>
              <TicketsPage />
            </RequireAuth>
          }
        />
        <Route path="converter" element={<ConverterPage />} />
        <Route path="terms" element={<LegalPage kind="terms" />} />
        <Route path="privacy" element={<LegalPage kind="privacy" />} />

        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="verify-email" element={<VerifyEmailPage />} />

        <Route
          path="account"
          element={
            <RequireAuth>
              <AccountPage />
            </RequireAuth>
          }
        />
        <Route
          path="account/seller"
          element={
            <RequireAuth>
              <SellerProfilePage />
            </RequireAuth>
          }
        />
        <Route path="sell" element={<SellPage />} />
        <Route path="shop/:slug" element={<ShopPage />} />
        <Route path="listings/:id" element={<ListingPage />} />
        <Route
          path="listings/new"
          element={
            <RequireAuth>
              <NewListingPage />
            </RequireAuth>
          }
        />
        <Route
          path="listings/:id/edit"
          element={
            <RequireAuth>
              <EditListingPage />
            </RequireAuth>
          }
        />
        <Route
          path="account/listings"
          element={
            <RequireAuth>
              <MyListingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="orders"
          element={
            <RequireAuth>
              <OrdersPage />
            </RequireAuth>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RequireAuth>
              <OrderPage />
            </RequireAuth>
          }
        />
        {['messages', 'messages/:id'].map((path) => (
          <Route
            key={path}
            path={path}
            element={
              <RequireAuth>
                <MessagesPage />
              </RequireAuth>
            }
          />
        ))}
        <Route
          path="notifications"
          element={
            <RequireAuth>
              <NotificationsPage />
            </RequireAuth>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="review" element={<ReviewQueuePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="tickets" element={<AdminTicketsPage />} />
          <Route path="tickets/:id" element={<AdminTicketPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="listings" element={<AdminListingsPage />} />
          <Route path="rates" element={<RatesPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="help" element={<FaqAdminPage />} />
          <Route path="audit" element={<AuditPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
