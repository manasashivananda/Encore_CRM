import { Routes, Route, Outlet } from "react-router-dom";
import ManageConfigs from "./manage";

export default function ConfigsCore() {
  return (
    <>
      <Routes>
        <Route path="/" element={<ModulesLayout />}>
          <Route index element={<ManageConfigs />} />
        </Route>
      </Routes>
      <Outlet />
    </>
  );
}

function ModulesLayout() {
  return <Outlet />;
}
