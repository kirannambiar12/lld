// ── Enums ────────────────────────────────────────────────

const VehicleType = Object.freeze({
    BIKE: "BIKE",
    CAR: "CAR",
    TRUCK: "TRUCK",
});

const SlotSize = Object.freeze({
    SMALL: "SMALL",
    MEDIUM: "MEDIUM",
    LARGE: "LARGE",
});

// Vehicle → Required Slot Mapping
const VehicleSizeMap = {
    [VehicleType.BIKE]: SlotSize.SMALL,
    [VehicleType.CAR]: SlotSize.MEDIUM,
    [VehicleType.TRUCK]: SlotSize.LARGE,
};

// ── Vehicle ──────────────────────────────────────────────

class Vehicle {
    constructor(licenseNumber, type) {
        this.licenseNumber = licenseNumber;
        this.type = type;
        this.requiredSize = VehicleSizeMap[type];
    }
}

// ── Parking Slot ─────────────────────────────────────────

class ParkingSlot {
    constructor(slotNumber, size) {
        this.slotNumber = slotNumber;
        this.size = size;
        this.isOccupied = false;
        this.vehicle = null;
    }

    canFit(vehicle) {
        return this.size === vehicle.requiredSize;
    }

    park(vehicle) {
        if (this.isOccupied) {
            throw new Error("Slot already occupied");
        }

        if (!this.canFit(vehicle)) {
            throw new Error("Vehicle cannot fit in this slot");
        }

        this.vehicle = vehicle;
        this.isOccupied = true;
    }

    leave() {
        this.vehicle = null;
        this.isOccupied = false;
    }
}

// ── Parking Floor ────────────────────────────────────────

class ParkingFloor {
    constructor(floorNumber, slots = []) {
        this.floorNumber = floorNumber;
        this.slots = slots;
    }

    findAvailableSlot(vehicle) {
        return this.slots.find(
            (slot) => !slot.isOccupied && slot.canFit(vehicle)
        );
    }
}

// ── Ticket ───────────────────────────────────────────────

class Ticket {
    constructor(ticketId, vehicle, slot) {
        this.ticketId = ticketId;
        this.vehicle = vehicle;
        this.slot = slot;
        this.entryTime = new Date();
    }
}

// ── Exports ──────────────────────────────────────────────

module.exports = {
    VehicleType,
    SlotSize,
    VehicleSizeMap,
    Vehicle,
    ParkingSlot,
    ParkingFloor,
    Ticket,
};
