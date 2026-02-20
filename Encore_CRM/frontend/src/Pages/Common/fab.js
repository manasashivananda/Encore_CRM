import { useState } from "react";
import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import Collapse from "@mui/material/Collapse";
import { MdLocalPrintshop } from "react-icons/md";
import { PiMicrosoftExcelLogoFill } from "react-icons/pi";
import { MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";

export default function FloatingActionButtons() {
  const [open, setOpen] = useState(false);

  return (
    <Box
      sx={{
        "& > :not(style)": { m: 0.5 },
        position: "fixed",
        right: 5,
        top: "20%",
        zIndex: 2,
        display: "grid",
        border: "1px solid #d22530",
        borderRadius: "20px",
        p: 1,
        backgroundColor: "#d22530",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Main Buttons */}
      <Fab color="default" size="small">
        <PiMicrosoftExcelLogoFill size={25} color="#d22530" />
      </Fab>

      <Fab color="default" size="small">
        <MdLocalPrintshop size={25} color="#d22530" />
      </Fab>

      {/* Collapsible Extra Buttons */}
      <Collapse in={open}>
        <Box
          sx={{
            display: "grid",
            "& > :not(style)": { m: 0.5 },
          }}
        >
          <Fab color="default" size="small">
            <MdLocalPrintshop size={25} color="#d22530" />
          </Fab>
        </Box>
      </Collapse>

      {/* Toggle Arrow Always Last */}
      <Fab
        color="default"
        size="small"
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? (
          <MdKeyboardArrowUp size={25} color="#d22530" />
        ) : (
          <MdKeyboardArrowDown size={25} color="#d22530" />
        )}
      </Fab>
    </Box>
  );
}
