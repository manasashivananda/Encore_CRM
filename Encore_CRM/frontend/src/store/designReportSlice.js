import { createSlice } from "@reduxjs/toolkit";
import moment from "moment";

const initialState = {
  filters: {
    search_text: "",
    designer: "",
    startDate: moment().startOf("").format("YYYY-MM-DD"),
    endDate: moment().endOf("").format("YYYY-MM-DD"),
  },
};

const designReportSlice = createSlice({
  name: "designReport",
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

export const { setFilters, resetFilters } = designReportSlice.actions;
export default designReportSlice.reducer;
