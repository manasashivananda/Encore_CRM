import { Routes, Route, Outlet } from "react-router-dom";
import GenerateBarcode from './manage';

export default function BarcodeGeneratorCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<GenerateBarcode />} />
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}

function Layout() {
    return (
        <>
            <Outlet />
        </>
    );
}
