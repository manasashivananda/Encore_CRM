import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import QuoteDesignersDashboard from "./dashboard";
import QuoteDesignerDetail from "./detail";

export default function QuoteDesignersCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<QuoteDesignersLayout />}>
          <Route index element={<QuoteDesignersDashboard />} />
          <Route path=":id" element={<QuoteDesignerDetail />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function QuoteDesignersLayout() {
  return <Outlet />;
}
