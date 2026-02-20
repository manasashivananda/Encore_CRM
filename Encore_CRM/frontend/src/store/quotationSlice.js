import { createSlice } from "@reduxjs/toolkit";
import moment from "moment";

const initialState = {
  filters: {
    search_text: "",
    myobStatus: "",
    customerId: "",
    startDate: moment().startOf("week").format("YYYY-MM-DD"),
    endDate: moment().endOf("week").format("YYYY-MM-DD"),
  },
  sorting: {
    sortField: "quote_unique_id",
    sortDirection: "-1",
  },
};

const quotationSlice = createSlice({
  name: "quotation",
  initialState,
  reducers: {
    setFilters(state, action) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setSorting(state, action) {
      state.sorting = action.payload;
    },
    resetFiltersAndSorting(state) {
      state.filters = initialState.filters;
      state.sorting = initialState.sorting;
    },
  },
});

export const { setFilters, setSorting, resetFiltersAndSorting } = quotationSlice.actions;
export default quotationSlice.reducer;
