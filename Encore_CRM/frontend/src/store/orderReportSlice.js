import { createSlice } from "@reduxjs/toolkit";
import moment from "moment";

const initialState = {
  filters: {
    search_text: "",
    employee: "",
    startDate: moment().startOf("").format("YYYY-MM-DD"),
    endDate: moment().endOf("").format("YYYY-MM-DD"),
    global: false,
  },
};

const orderReportSlice = createSlice({
  name: "orderReport",
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    resetFilters(state) {
      state.filters = initialState.filters;
    },
  },
});

export const { setFilters, resetFilters } = orderReportSlice.actions;
export default orderReportSlice.reducer;
