import { differenceInCalendarDays, format, parseISO, addDays, isSameDay } from 'date-fns';
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

function getRoomCategory(objectId: string) {
  return CC_OBJECTS.find(object => object.id === objectId)?.category
    || GB_OBJECTS.find(object => object.id === objectId)?.category
    || '';
}

export function prepareContractDataFromContract(contract: Contract, client: Client): ContractData {
  const mainBooking = contract.bookings.find(booking => booking.type === 'main');
  const banyaBooking = contract.bookings.find(booking => booking.objectId === 'gb-bath');
  const furakoBooking = contract.bookings.find(booking => booking.objectId === 'gb-furako');
  const primaryBooking = mainBooking || banyaBooking || furakoBooking;

  let dateIn = primaryBooking ? formatDateTime(primaryBooking.startTime, 'dd.MM.yyyy') : '';
  let timeIn = primaryBooking ? formatDateTime(primaryBooking.startTime, 'HH:mm') : '';
  let dateOut = primaryBooking ? formatDateTime(primaryBooking.endTime, 'dd.MM.yyyy') : '';
  let timeOut = primaryBooking ? formatDateTime(primaryBooking.endTime, 'HH:mm') : '';
  
  let nights = mainBooking
    ? getHotelDaysCount(mainBooking.startTime, mainBooking.endTime)
    : primaryBooking
      ? getHoursCount(primaryBooking.startTime, primaryBooking.endTime)
      : 0;

  if (contract.baseType === 'chunga-changa' && primaryBooking) {
    const startIso = parseISO(primaryBooking.startTime);
    const endIso = parseISO(primaryBooking.endTime);
    if (!isNaN(startIso.getTime()) && !isNaN(endIso.getTime())) {
      timeIn = '14:00';
      timeOut = '12:00';
      if (isSameDay(startIso, endIso) || nights === 0) {
        nights = 1;
        dateOut = format(addDays(startIso, 1), 'dd.MM.yyyy');
      }
    }
  }

  const guests = contract.guestsCount || 0;

  return {
    contractNumber: contract.number,
    signDate: contract.dateSigned,
    current_date: format(new Date(), 'dd.MM.yyyy'),
    dateIn,
    timeIn,
    dateOut,
    timeOut,
    nights: nights || 1, // ensure at least 1 for display fallback
    guests: guests || 1, // ensure at least 1 for display fallback
    cottageNumber: mainBooking ? getCottageName(mainBooking.objectId) : '',
    roomCategory: mainBooking ? getRoomCategory(mainBooking.objectId) : '',
    base: contract.baseType,
    totalRub: contract.totalAmount,
    prepaymentRub: contract.prepayment,
    client: {
      fullName: getClientFullName(client),
      dob: client.type === 'physical' ? client.birthDate || '' : '',
      passport: client.type === 'physical' ? `${client.passportSeries} ${client.passportNumber}` : client.inn,
      passportDate: client.type === 'physical' ? client.passportIssueDate : '',
      passportIssuedBy: client.type === 'physical' ? client.passportIssuedBy : '',
      passportCode: client.type === 'physical' ? (client.passportCode || '') : '',
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
