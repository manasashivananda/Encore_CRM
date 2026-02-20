import { createSlice } from "@reduxjs/toolkit";

const doubtSlice = createSlice({
  name: "doubt",
  initialState: {
    count: 0,
  },
  reducers: {
    setDoubtCount: (state, action) => {
      state.count = action.payload;
    },
  },
});

export const { setDoubtCount } = doubtSlice.actions;
export default doubtSlice.reducer;
