import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import QuotationManage from "./manage";

const QuotationDetail = React.lazy(() => import("./detail"));
const QuoteQualityCheckingCore = React.lazy(() => import("./QCManagement"));
const QuoteDesignersCore = React.lazy(() => import("./DesignersManagement"));

export default function QuotationCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<QuotationLayout />}>
          <Route index element={<QuotationManage />} />
          <Route path="/master" element={<QuotationManage />} />
          <Route
            path="/master/:id"
            element={
              <React.Suspense fallback={<>...</>}>
                <QuotationDetail />
              </React.Suspense>
            }
          />
          <Route
            path="/designers/*"
            element={
              <React.Suspense fallback={<>...</>}>
                <QuoteDesignersCore />
              </React.Suspense>
            }
          />
          <Route
            path="/quality-checking/*"
            element={
              <React.Suspense fallback={<>...</>}>
                <QuoteQualityCheckingCore />
              </React.Suspense>
            }
          />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function QuotationLayout() {
  return <Outlet />;
}
