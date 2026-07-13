import { differenceInCalendarDays, eachDayOfInterval, format, parseISO } from "date-fns";
export const toLocalDate=(date=new Date())=>format(date,"yyyy-MM-dd");
export const inclusiveDays=(start:string,end:string)=>Math.max(differenceInCalendarDays(parseISO(end),parseISO(start))+1,0);
export const activeDates=(start:string,end:string,weekdays:number[])=>eachDayOfInterval({start:parseISO(start),end:parseISO(end)}).filter(d=>weekdays.includes(d.getDay()));
