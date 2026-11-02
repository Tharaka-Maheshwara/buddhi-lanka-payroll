import {describe,it,expect} from 'vitest';
import {calculateClock,validateDurations} from './time';
describe('attendance clock calculation',()=>{
 it('subtracts personal leave',()=>expect(calculateClock({inTime:'08:25',outTime:'19:40',leaveOut:'14:30',leaveIn:'17:10'})).toEqual({leave:160,worked:515}));
 it('subtracts other breaks once',()=>expect(calculateClock({inTime:'08:00',outTime:'17:00',breakMinutes:60}).worked).toBe(480));
 it('supports overnight return from personal leave',()=>expect(calculateClock({inTime:'22:00',outTime:'06:00',overnight:true,leaveOut:'01:00',leaveIn:'01:30'}).worked).toBe(450));
 it('rejects leave outside the shift',()=>expect(()=>calculateClock({inTime:'08:00',outTime:'17:00',leaveOut:'07:00',leaveIn:'09:00'})).toThrow());
 it('rejects unpaired leave times',()=>expect(()=>calculateClock({inTime:'08:00',outTime:'17:00',leaveOut:'09:00'})).toThrow());
 it('rejects excessive breaks',()=>expect(()=>calculateClock({inTime:'08:00',outTime:'09:00',breakMinutes:90})).toThrow());
 it('rejects fractional and negative payroll durations',()=>expect(()=>validateDurations({regular:480,late:0,unpaid:-1,ot:1.5,double:0})).toThrow());
});
