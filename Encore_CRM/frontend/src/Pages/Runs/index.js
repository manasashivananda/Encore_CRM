import { Routes, Route, Outlet } from "react-router-dom";
import ManageRuns from './manage';
import ManageDrivers from "./DriverMaster/manage";
import ManageTruck from "./TruckMaster/manage";
import ManageTruckLogs from "./TruckMaster/logs";


export default function RunsCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<RunsLayout />}>
                    <Route path="runs/" element={<ManageRuns />} />
                    <Route path="drivers/" element={<ManageDrivers />} />
                    <Route path="trucks/" element={<ManageTruck />} />
                    <Route path="trucks/:id" element={<ManageTruckLogs />} />
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}


function RunsLayout() {
    return (
            <Outlet />
    );
}
