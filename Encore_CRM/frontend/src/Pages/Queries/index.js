import * as React from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import QueriesManage from './manage';



export default function QuotationCore() {
    return (
        <>
            <Routes>
                <Route path="/" element={<QueriesLayout />}>
                    <Route index element={<QueriesManage />} />
                    <Route path="/master" element={<QueriesManage />} />
                </Route>
            </Routes>
            <Outlet />
        </>
    );
}

function QueriesLayout() {
    return (
        <Outlet />
    );
}
