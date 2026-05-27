import type {
  ClientContractHistoryBooking,
  ClientContractHistoryItem,
  ClientContractHistorySummary,
  Contract,
} from '../types';

function toTime(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function toHistoryBooking(booking: Contract['bookings'][number]): ClientContractHistoryBooking {
  return {
    id: booking.id,
    objectId: booking.objectId,
    baseType: booking.baseType,
    startTime: booking.startTime,
    endTime: booking.endTime,
    type: booking.type,
    price: Number(booking.price || 0),
  };
}

function getPrimaryBooking(bookings: ClientContractHistoryBooking[]) {
  return bookings.find(booking => booking.type === 'main') || bookings[0];
}

export function buildClientContractHistory(
  contracts: Contract[],
  clientId: string | null | undefined,
): ClientContractHistorySummary {
  const relevantContracts = clientId
    ? contracts.filter(contract => contract.clientId === clientId)
    : [];

  const items: ClientContractHistoryItem[] = relevantContracts
    .map(contract => {
      const bookings = contract.bookings.map(toHistoryBooking);
      return {
        contractId: contract.id,
        contractNumber: contract.number,
        baseType: contract.baseType,
        status: contract.status,
        totalAmount: Number(contract.totalAmount || 0),
        createdAt: contract.createdAt,
        dateSigned: contract.dateSigned,
        primaryBooking: getPrimaryBooking(bookings),
        bookings,
      };
    })
    .sort((a, b) => {
      const aDate = toTime(a.primaryBooking?.startTime) || toTime(a.createdAt);
      const bDate = toTime(b.primaryBooking?.startTime) || toTime(b.createdAt);
      return bDate - aDate;
    });

  const activeBookingCount = items.filter(item => item.status !== 'cancelled').length;

  return {
    clientId: clientId || '',
    totalContracts: items.length,
    activeBookingCount,
    hasLoyaltyHint: activeBookingCount >= 5,
    items,
  };
}
