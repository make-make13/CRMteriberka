import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { CC_OBJECTS, GB_OBJECTS } from '../constants';
import type { Client, Contract, ContractData } from '../types';

function formatDateTime(value: string, pattern: string) {
  const date = parseISO(value);
  return isNaN(date.getTime()) ? '' : format(date, pattern);
}

function getHotelDaysCount(startIso: string, endIso: string) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, differenceInCalendarDays(end, start));
}

function getHoursCount(startIso: string, endIso: string) {
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60));
}

function getClientFullName(client: Client) {
  return client.type === 'physical'
    ? `${client.lastName} ${client.firstName} ${client.middleName || ''}`.trim()
    : client.organizationName;
}

function getCottageName(objectId: string) {
  return CC_OBJECTS.find(object => object.id === objectId)?.name
    || GB_OBJECTS.find(object => object.id === objectId)?.name
    || '';
}

export function prepareContractDataFromContract(contract: Contract, client: Client): ContractData {
  const mainBooking = contract.bookings.find(booking => booking.type === 'main');
  const banyaBooking = contract.bookings.find(booking => booking.objectId === 'gb-bath');
  const furakoBooking = contract.bookings.find(booking => booking.objectId === 'gb-furako');
  const primaryBooking = mainBooking || banyaBooking || furakoBooking;

  return {
    contractNumber: contract.number,
    signDate: contract.dateSigned,
    current_date: format(new Date(), 'dd.MM.yyyy'),
    dateIn: primaryBooking ? formatDateTime(primaryBooking.startTime, 'dd.MM.yyyy') : '',
    timeIn: primaryBooking ? formatDateTime(primaryBooking.startTime, 'HH:mm') : '',
    dateOut: primaryBooking ? formatDateTime(primaryBooking.endTime, 'dd.MM.yyyy') : '',
    timeOut: primaryBooking ? formatDateTime(primaryBooking.endTime, 'HH:mm') : '',
    nights: mainBooking
      ? getHotelDaysCount(mainBooking.startTime, mainBooking.endTime)
      : primaryBooking
        ? getHoursCount(primaryBooking.startTime, primaryBooking.endTime)
        : 0,
    guests: contract.guestsCount || 0,
    cottageNumber: mainBooking ? getCottageName(mainBooking.objectId) : '',
    base: contract.baseType,
    totalRub: contract.totalAmount,
    prepaymentRub: contract.prepayment,
    client: {
      fullName: getClientFullName(client),
      dob: client.type === 'physical' ? client.birthDate || '' : '',
      passport: client.type === 'physical' ? `${client.passportSeries} ${client.passportNumber}` : client.inn,
      passportDate: client.type === 'physical' ? client.passportIssueDate : '',
      passportIssuedBy: client.type === 'physical' ? client.passportIssuedBy : '',
      address: client.type === 'physical' ? client.registrationAddress : client.legalAddress,
      phone: client.phone,
      email: client.email || '',
      inn: client.type === 'legal' ? client.inn : undefined,
      kpp: client.type === 'legal' ? client.kpp : undefined,
      ogrn: client.type === 'legal' ? client.ogrn : undefined,
    },
    services: {
      banya: banyaBooking ? {
        timeFrom: formatDateTime(banyaBooking.startTime, 'HH:mm'),
        timeTo: formatDateTime(banyaBooking.endTime, 'HH:mm'),
      } : undefined,
      furako: furakoBooking ? {
        timeFrom: formatDateTime(furakoBooking.startTime, 'HH:mm'),
        timeTo: formatDateTime(furakoBooking.endTime, 'HH:mm'),
      } : undefined,
    },
  };
}
