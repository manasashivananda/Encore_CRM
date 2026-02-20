import React, { useCallback, useState, useEffect } from "react";
import { Avatar as MuiAvatar, TextField, MenuItem } from "@mui/material";
import PropTypes from "prop-types";
import { Badge } from "react-bootstrap";

const BaseTag = React.forwardRef(({ tag, children, ...props }, ref) => {
  return React.createElement(tag, { ...props, ref }, children);
});

export const MyDiv = React.forwardRef((props, ref) => <BaseTag tag="div" ref={ref} {...props} />);

export const PTag = React.forwardRef((props, ref) => <BaseTag tag="p" ref={ref} {...props} />);

export const LabelTag = React.forwardRef((props, ref) => <BaseTag tag="label" ref={ref} {...props} />);

export const SpanTag = React.forwardRef((props, ref) => <BaseTag tag="span" ref={ref} {...props} />);

export const StrongTag = React.forwardRef((props, ref) => <BaseTag tag="strong" ref={ref} {...props} />);

export const HeadingOne = React.forwardRef((props, ref) => <BaseTag tag="h1" ref={ref} {...props} />);

export const HeadingTwo = React.forwardRef((props, ref) => <BaseTag tag="h2" ref={ref} {...props} />);

export const HeadingThree = React.forwardRef((props, ref) => <BaseTag tag="h3" ref={ref} {...props} />);

export const HeadingFour = React.forwardRef((props, ref) => <BaseTag tag="h4" ref={ref} {...props} />);

export const HeadingFive = React.forwardRef((props, ref) => <BaseTag tag="h5" ref={ref} {...props} />);

export const HeadingSix = React.forwardRef((props, ref) => <BaseTag tag="h6" ref={ref} {...props} />);

// Avatar Start
function stringToColor(string) {
  let hash = 0;
  for (let i = 0; i < string.length; i += 1) {
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let i = 0; i < 3; i += 1) {
    const value = (hash >> (i * 9)) & 0xaa;
    color += `aa${value.toString(16)}`.slice(-2);
  }
  return color;
}

function stringAvatar(name) {
  const initials = name
    ?.split(" ")
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return { sx: { bgcolor: stringToColor(name || "User") }, children: initials };
}

export function Avatar({ name, sx, ...props }) {
  const avatarProps = stringAvatar(name);
  return <MuiAvatar {...avatarProps} sx={{ ...avatarProps.sx, ...sx }} {...props} />;
}
// Avatar End

// Currency Start
export function CurrencyDisplay({ value, currency = "USD", locale = "en-US" }) {
  const formattedValue = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency,
  }).format(value);
  return <span>{formattedValue}</span>;
}
// Currency End

// Date Formatting
export function GetDayFromDate({ deliveryDate }) {
  const getDayFromDate = dateStr => {
    if (!dateStr || typeof dateStr !== "string") return "Invalid Date";

    let date;
    const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (match) {
      const [, dayStr, monthStr, yearStr] = match;
      const day = parseInt(dayStr, 10);
      const month = parseInt(monthStr, 10) - 1;
      const year = parseInt(yearStr, 10);
      date = new Date(year, month, day);
    } else {
      const parsed = Date.parse(dateStr);
      if (!isNaN(parsed)) {
        date = new Date(parsed);
      } else {
        return "Invalid Date";
      }
    }

    if (isNaN(date.getTime())) return "Invalid Date";

    return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(date);
  };

  useEffect(() => {
    if (deliveryDate) {
      getDayFromDate(deliveryDate);
    }
  }, [deliveryDate]);

  return <>{deliveryDate ? getDayFromDate(deliveryDate) : "Day not available"}</>;
}

export function getFormattedDeliveryTime(time, session, type = "other") {
  if (time?.trim() === "AT") {
    return type === "other" ? "A/T": "";
  }
  if (session === "A/T" && time?.trim() === "12.00 AM") {
    return type === "other" ? "A/T": "";
  }
  if (!time) {
    return session || "";
  }
  const [rawTime, meridian] = time.trim().split(" ");
  if (!rawTime || !meridian) {
    return session ? `${session} ${time}` : time;
  }
  let [hour, minute] = rawTime.split(".");
  hour = String(parseInt(hour, 10));
  const timeStr = minute === "00" ? `${hour}${meridian.toUpperCase()}` : `${hour}.${minute}${meridian.toUpperCase()}`;
  if (session === "B4" || session === "Aft") {
    return `${session} ${timeStr}`;
  }
  return timeStr;
}

// InputField Component
export const InputField = ({ type = "text", id, label, value, onChange, options = [], required = false, multiple = false, validationType = null, ...props }) => {
  const [error, setError] = useState("");

  // Validation regex patterns
  const validationPatterns = {
    alphabet: /^[A-Za-z\s]*$/,
    alphanumeric: /^[A-Za-z0-9\s]*$/,
    numeric: /^[0-9]*$/,
  };

  // Email validation
  const validateEmail = email => {
    if (!email && required) return "Email is required";
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return email && !regex.test(email) ? "Invalid email format" : "";
  };

  // Phone number formatting
  const formatPhoneNumber = raw => {
    raw = raw.replace(/\D/g, "").slice(0, 10);
    if (raw.length === 0) return "";
    if (/^04/.test(raw)) {
      if (raw.length <= 4) return raw;
      if (raw.length <= 7) return `${raw.slice(0, 4)} ${raw.slice(4)}`;
      return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
    } else if (/^0[2378]/.test(raw)) {
      if (raw.length <= 2) return raw;
      if (raw.length <= 6) return `${raw.slice(0, 2)} ${raw.slice(2)}`;
      return `${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6, 10)}`;
    }
    if (raw.length <= 4) return raw;
    if (raw.length <= 7) return `${raw.slice(0, 4)} ${raw.slice(4)}`;
    return `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
  };

  // Phone number validation
  const validatePhone = raw => {
    const digits = raw.replace(/\D/g, "");
    return digits.length === 10;
  };

  // Handle input change
  const handleInputChange = useCallback(
    e => {
      const { value: inputValue } = e.target;

      if (type === "text" && validationType) {
        if (inputValue && !validationPatterns[validationType].test(inputValue)) {
          return; // Ignore invalid input
        }
        setError("");
        onChange({ id, value: inputValue });
      } else if (type === "email") {
        const validationError = validateEmail(inputValue);
        setError(validationError);
        onChange({ id, value: inputValue });
      } else if (type === "phone") {
        const rawValue = inputValue.replace(/\D/g, "").slice(0, 10);
        const formattedValue = formatPhoneNumber(rawValue);
        const isValid = validatePhone(rawValue);
        setError(rawValue && !isValid ? "Phone number must be 10 digits" : "");
        onChange({ id, value: formattedValue, isValid });
      } else if (type === "select") {
        setError("");
        onChange({ id, value: inputValue });
      }
    },
    [id, type, validationType, required, onChange]
  );

  // Handle phone key down to prevent invalid characters
  const handlePhoneKeyDown = e => {
    if (type === "phone") {
      const invalidKeys = ["e", "E", "+", "-", ".", ","];
      if (invalidKeys.includes(e.key)) {
        e.preventDefault();
      }
    }
  };

  return (
    <TextField id={id} label={label} value={value} onChange={handleInputChange} onKeyDown={type === "phone" ? handlePhoneKeyDown : undefined} variant="standard" required={required} fullWidth select={type === "select"} SelectProps={type === "select" ? { multiple } : undefined} type={type === "phone" || (type === "text" && validationType === "numeric") ? "tel" : type} inputProps={type === "phone" ? { inputMode: "numeric", maxLength: 12 } : undefined} error={!!error} helperText={error} {...props}>
      {type === "select" &&
        options.map(option => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
    </TextField>
  );
};

export function getDayOfWeek(dateString) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const date = new Date(dateString);
    return days[date.getDay()];
}

export const getRowColor = (item, type = "delivery") => {
  if (!item) return { rowColor: "", classname: "" };

  const codn =
    type === "delivery"
      ? (item.Order_Roofing_Count !== undefined && item.Order_Roofing_Count !== 0)
      : (item.products !== "" && item.products?.includes("R"));

  let rowColor = "";
  let classname = "";

  if (item.order_priority_status === 1) {
    rowColor = "a6cff7";
    classname = "priority-1"; // Mapped primary color
  } else if (
    (codn && item.order_priority_status === 0) ||
    item.order_priority_status === 2
  ) {
    rowColor = "b9ffc0";
    classname = "priority-2"; // Roofing color override
  } else if (item.order_crane_lift_checker && item.order_priority_status === 0) {
    rowColor = "fcefe3";
    classname = "priority-3";
  } else if (item.Order_Roofing_Count && item.order_priority_status === 0) {
    rowColor = "b9ffc0";
    classname = "priority-4";
  }

  return { rowColor, classname };
};

export const hasAnyProductionInProgress = (order) => {
    const productionTypes = [
      { key: 'f_order_prod_push_status'},
      { key: 'j_order_prod_push_status'},
      { key: 'fg_order_prod_push_status' },
      { key: 'cl_order_prod_push_status' },
      { key: 'roof_order_prod_push_status'},
      { key: 'gbi_order_prod_push_status'},
    ];

    return productionTypes.some(type => 
      order[type.key] === 2
    );
  };

 export const getProductionStatusBadge = (order) => {
    const productionTypes = [
      { key: 'f_order_prod_push_status', label: 'F', currentKey: 'f_order_prod_current_status' },
      { key: 'j_order_prod_push_status', label: 'J', currentKey: 'j_order_prod_current_status' },
      { key: 'fg_order_prod_push_status', label: 'FG', currentKey: 'fg_order_prod_current_status' },
      { key: 'cl_order_prod_push_status', label: 'CL', currentKey: 'cl_order_prod_current_status' },
      { key: 'roof_order_prod_push_status', label: 'ROOF', currentKey: 'roof_order_prod_current_status' },
      { key: 'gbi_order_prod_push_status', label: 'GBI', currentKey: 'gbi_order_prod_current_status' },
    ];

    const badges = productionTypes
      .filter(type => order[type.key] === 1 || order[type.key] === 2 || order[type.currentKey] === "6")
      .map(type => {
        const backgroundColor = (order[type.key] === 1 || order[type.key] === 2) && order[type.currentKey] !== "6" ? "#f0ad4e" : "#3aad76";
        return (
          <Badge key={type.label} bg="" color="default" style={{ backgroundColor }} text="light">
            {type.label}
          </Badge>
        );
      });

    return badges.length > 0 ? badges : null;
  };


// PropTypes
CurrencyDisplay.propTypes = {
  value: PropTypes.any,
  currency: PropTypes.string,
  locale: PropTypes.string,
};
GetDayFromDate.propTypes = {
  deliveryDate: PropTypes.string,
};
Avatar.propTypes = {
  name: PropTypes.any,
  sx: PropTypes.any,
};
InputField.propTypes = {
  type: PropTypes.oneOf(["text", "select", "email", "phone"]),
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
    })
  ),
  required: PropTypes.bool,
  multiple: PropTypes.bool,
  validationType: PropTypes.oneOf(["alphabet", "alphanumeric", "numeric", null]),
};
