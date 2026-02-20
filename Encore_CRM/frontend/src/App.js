

import React, { useEffect, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.scss';
import { Routes, Route } from "react-router-dom";
import TemplateCore from "./Pages/template";
import moment from 'moment-timezone';
import AutoLogout from './Pages/Common/autoLogout';
import useEnvironment from "./hooks/useEnvironment";
import { useLocation } from "react-router-dom";
// import { NavigationGuardProvider } from './context/NavigationGuardContext';

// Design Components
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import OrderDetail from './Pages/Orders/detail';
import DrawingCanvas from "./Pages/DrawingComponents/DrawingCanvas";
import SelectMaterialsSimplified from "./Pages/DrawingComponents/SelectMaterialsSimplified";
import TemplateLibrary from "./Pages/DrawingComponents/TemplateLibrary";
import DrawingDetailsTab from "./Pages/Drawings/DrawingDetailsTab";
const DrawingToolPage = React.lazy(() => import("./Pages/DrawingComponents/DrawingToolPage"));



const CoreLogin = React.lazy(() => import("./Pages/Auth/login"));
const CoreForgotPassword = React.lazy(() => import("./Pages/Auth/forgot-password"));
const CoreUpdatePassword = React.lazy(() => import("./Pages/Auth/update-password"));
const CoreChangePassword = React.lazy(() => import("./Pages/Auth/change-password"));
const CoreProfile = React.lazy(() => import("./Pages/Auth/profile"));
const DashboardCore = React.lazy(() => import("./Pages/Dashboard"));
const CustomerCore = React.lazy(() => import("./Pages/Customers"));
const UsersCore = React.lazy(() => import("./Pages/Users"));
const ProductCore = React.lazy(() => import("./Pages/Products"));
const ModulesCore = React.lazy(() => import("./Pages/Users/Modules"));
const CustomItemCode = React.lazy(() => import("./Pages/Masters/CustomItemCode"));
const DepartmentCore = React.lazy(() => import("./Pages/Masters/Department"));
const RackingCore = React.lazy(() => import("./Pages/Masters/Racking"));
const CityCore = React.lazy(() => import("./Pages/Masters/City"));
const LogsCore = React.lazy(() => import("./Pages/Masters/logs"));
const OrdersCore = React.lazy(() => import("./Pages/Orders"));
const QuotationCore = React.lazy(() => import("./Pages/Quotation"));
const QueriesLayout = React.lazy(() => import("./Pages/QueryManagement"));
const OrderDesignersCore = React.lazy(() => import("./Pages/OrderDesignersManagement"));
const OrderQualityCheckingCore = React.lazy(() => import("./Pages/OrderQCManagement"));
const OrderProductionCore = React.lazy(() => import("./Pages/OrderProductionManagement"));
const ReportsCore = React.lazy(() => import("./Pages/Reports"));
const RunsCore = React.lazy(() => import("./Pages/Runs"));
const BarcodeGeneratorCore = React.lazy(() => import("./Pages/BarcodeGenerator"))
// const MessageCoordinator = React.lazy(() => import("./Pages/Socket/Coordinator"))
const DeliveryPlanningCore = React.lazy(() => import("./Pages/DeliveryPlanning"))

function App() {
  const env = useEnvironment();
  useEffect(() => {
    moment.tz.setDefault('Australia/Sydney');
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('token'));

  // Update login status if token changes
  useEffect(() => {
    const handleStorage = () => {
      setIsLoggedIn(!!localStorage.getItem('token'));
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    console.log('Logged out due to inactivity');
  };

  const location = useLocation();
  const hideWatermarkRoutes = ["/", "/login", "/forgot-password"];
  const isUpdatePasswordRoute = location.pathname.startsWith("/update-password");

  window.addEventListener('error', e => {
  if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
    const resizeObserverErrDiv = document.getElementById('webpack-dev-server-client-overlay-div');
    const resizeObserverErr = document.getElementById('webpack-dev-server-client-overlay');
    if (resizeObserverErr) {
      resizeObserverErr.setAttribute('style', 'display: none');
    }
    if (resizeObserverErrDiv) {
      resizeObserverErrDiv.setAttribute('style', 'display: none');
    }
  }
});


  return (
    <>
    <AutoLogout
      timeout={2 * 60 * 60 * 1000} // 2h
      isLoggedIn={isLoggedIn}
      onLogout={handleLogout}
    />
      {(env.base_url === env.test_url || env.base_url === env.test_url_2) &&
      !hideWatermarkRoutes.includes(location.pathname) &&
      !isUpdatePasswordRoute && (
        <div className="watermark"> Testing Site </div>
      )}
      <Routes>
      <Route path="/" element={<CoreLogin onLogin={() => setIsLoggedIn(true)}/>} />
      <Route path="login" element={<React.Suspense fallback={<>...</>}><CoreLogin onLogin={() => setIsLoggedIn(true)}/></React.Suspense>} />
      <Route
        path="forgot-password"
        element={
          <React.Suspense fallback={<>...</>}>
            <CoreForgotPassword />
          </React.Suspense>
        }
      />
      <Route
        path="update-password/:id"
        element={
          <React.Suspense fallback={<>...</>}>
            <CoreUpdatePassword />
          </React.Suspense>
        }
      />
      <Route element={<TemplateCore />}>
        {/* design components routes */}
        <Route path="/order-detail/:id" element={<OrderDetail />} />
        <Route path="/orders/:order_unique_id/drawings/:drawingId"
          element={<DrawingDetailsTab />}
        />
        <Route path="/template-library" element={<TemplateLibrary />} />
        <Route path="orders/:order_unique_id/drawings/templates" element={<TemplateLibrary />} />
        {/* Quotation drawing route */}
        <Route path="quotes/:order_unique_id/drawings/templates" element={<TemplateLibrary />} />
        <Route path="/select-materials-simplified" element={<SelectMaterialsSimplified />} />
        <Route path="/draw" element={<DrawingCanvas />} />
        <Route path="/orders/:order_unique_id/drawings/new" element={<React.Suspense fallback={<>...</>}><DrawingToolPage /></React.Suspense>} />
        {/* Quotation new drawing route */}
        <Route path="/quotes/:order_unique_id/drawings/new" element={<React.Suspense fallback={<>...</>}><DrawingToolPage /></React.Suspense>} />

        <Route
          path="change-password/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <CoreChangePassword />
            </React.Suspense>
          }
        />
        <Route
          path="profile/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <CoreProfile />
            </React.Suspense>
          }
        />
        <Route
          index
          path="dashboard/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <DashboardCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="customer/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <CustomerCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="users/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <UsersCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="materials/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <ProductCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="modules/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <ModulesCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="custom-item-code/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <CustomItemCode />
            </React.Suspense>
          }
        />
        <Route
          index
          path="departments/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <DepartmentCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="racking/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <RackingCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="city/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <CityCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="logs/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <LogsCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="orders/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <OrdersCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="quotation/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <QuotationCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="query-management/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <QueriesLayout />
            </React.Suspense>
          }
        />
        <Route
          index
          path="designers/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <OrderDesignersCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="quality-checking/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <OrderQualityCheckingCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="production/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <OrderProductionCore />
            </React.Suspense>
          }
        />
        <Route
          index
          path="reports/*"
          element={
            <React.Suspense fallback={<>...</>}>
              <ReportsCore />
            </React.Suspense>
          }
        />
        <Route index path="transport/*" element={<React.Suspense fallback={<>...</>}><RunsCore /></React.Suspense>} />
        <Route index path="generate-barcode/*" element={<React.Suspense fallback={<>...</>}><BarcodeGeneratorCore /></React.Suspense>} />
        {/* <Route index path="msg/*" element={<React.Suspense fallback={<>...</>}><MessageCoordinator /></React.Suspense>} /> */}
        <Route index path="del-planning/*" element={<React.Suspense fallback={<>...</>}><DeliveryPlanningCore /></React.Suspense>} />
      </Route>
    </Routes>
    <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default App;
