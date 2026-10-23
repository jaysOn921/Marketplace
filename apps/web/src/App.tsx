import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout';
import { RequireAdmin } from './components/RequireAdmin';
import { RequireAuth } from './components/RequireAuth';
import { AccountPage } from './pages/account/AccountPage';
import { MyListingsPage } from './pages/account/MyListingsPage';
import { ReviewQueuePage } from './pages/admin/ReviewQueuePage';
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
import { NotFoundPage } from './pages/NotFoundPage';
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
          path="admin/review"
          element={
            <RequireAdmin>
              <ReviewQueuePage />
            </RequireAdmin>
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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
