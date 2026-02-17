const {
    VehicleType,
    SlotSize,
    Vehicle,
    ParkingSlot,
    ParkingFloor,
    Ticket,
} = require("./classes");

// ── Parking Lot (Main System) ────────────────────────────

class ParkingLot {
    constructor(floors = []) {
        this.floors = floors;
        this.tickets = new Map();
        this.ticketCounter = 0;
    }

    parkVehicle(vehicle) {
        for (let floor of this.floors) {
            const slot = floor.findAvailableSlot(vehicle);

            if (slot) {
                slot.park(vehicle);

                const ticket = new Ticket(
                    ++this.ticketCounter,
                    vehicle,
                    slot
                );

                this.tickets.set(ticket.ticketId, ticket);

                console.log(
                    `Vehicle parked. Ticket ID: ${ticket.ticketId}`
                );

                return ticket;
            }
        }

        throw new Error("Parking Full");
    }

    unparkVehicle(ticketId) {
        const ticket = this.tickets.get(ticketId);

        if (!ticket) {
            throw new Error("Invalid ticket");
        }

        ticket.slot.leave();
        this.tickets.delete(ticketId);

        const durationMinutes =
            (new Date() - ticket.entryTime) / 1000 / 60;

        const fee = Math.ceil(durationMinutes);

        console.log(`Vehicle unparked. Fee: ₹${fee}`);

        return fee;
    }
}

// ── Example Usage ────────────────────────────────────────

// Create slots
const slotsFloor1 = [
    new ParkingSlot(1, SlotSize.SMALL),
    new ParkingSlot(2, SlotSize.MEDIUM),
    new ParkingSlot(3, SlotSize.LARGE),
];

const floor1 = new ParkingFloor(1, slotsFloor1);

// Create parking lot
const parkingLot = new ParkingLot([floor1]);

// Vehicles
const car = new Vehicle("KA-01-1234", VehicleType.CAR);
const bike = new Vehicle("KA-02-5678", VehicleType.BIKE);

// Park vehicles
const carTicket = parkingLot.parkVehicle(car);
const bikeTicket = parkingLot.parkVehicle(bike);

// Unpark vehicle
parkingLot.unparkVehicle(carTicket.ticketId);

module.exports = { ParkingLot };
