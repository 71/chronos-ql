import Chronos from './chronos'
import { ObjectType, Field, Int, Resolver, Query, Arg, Root, FieldResolver, useContainer, Args } from 'type-graphql'

@ObjectType()
export class CourseLocation {
  @Field()
  name: string;

  static isSameLocation(as: CourseLocation[], bs: CourseLocation[]): boolean {
    if (as.length != bs.length)
      return false
    
    for (let i = 0; i < as.length; i++) {
      if (as[i].name != bs[i].name)
        return false
    }

    return true
  }
}

@ObjectType()
export class StaffMember {
  @Field()
  name: string;

  static isSameStaff(as: StaffMember[], bs: StaffMember[]): boolean {
    if (as.length != bs.length)
      return false
    
    for (let i = 0; i < as.length; i++) {
      if (as[i].name != bs[i].name)
        return false
    }

    return true
  }
}

@ObjectType()
export class Course {
  @Field()
  start: Date;

  @Field(type => Int)
  duration: number;

  @Field()
  name: string;

  @Field(type => [CourseLocation])
  locations: CourseLocation[] = [];

  @Field(type => [StaffMember])
  staff: StaffMember[] = [];

  @Field()
  get end(): Date {
    return new Date(this.start.valueOf() + 60_000 * this.duration)
  }
}

@ObjectType()
export class ScheduleDay {
  @Field(type => [Course])
  courses: Course[] = []

  @Field()
  get dayStart(): Date {
    return this.courses[0].start
  }

  @Field()
  get dayEnd(): Date {
    return this.courses[this.courses.length - 1].end
  }
}

@ObjectType()
export class Group {
  @Field()
  name: string;

  @Field(type => Int)
  id: number;

  schedule: ScheduleDay[] = [];
}

export class Database {
  loading: number = 0;

  chronos: Chronos = new Chronos();
  savedGroups: Group[] = [];

  provideToResolver() {
    const self = this

    useContainer({
      get: (_, __) => new ChronosResolver(self)
    })
  }

  get isLoading() {
    return this.loading > 0
  }

  private async loadWeek(groupId: number, weekId: number, group: Group) {
    const week = await this.chronos.getWeek(weekId, groupId)

    for (const weekDay of week.DayList) {
      if (weekDay.CourseList.length == 0)
        continue

      const day = new ScheduleDay()

      for (const dayCourse of weekDay.CourseList) {
        const course = new Course()

        course.name      = dayCourse.Name
        course.start     = new Date(Date.parse(dayCourse.BeginDate))
        course.duration  = dayCourse.Duration
        course.locations = dayCourse.RoomList.map(room => <CourseLocation>{ name: room.Name })
        course.staff     = dayCourse.StaffList.map(member => <StaffMember>{ name: member.Name })

        // Merge course with previous one if needed
        const prev  = day.courses.length ? day.courses[day.courses.length - 1] : null
        const merge = prev                                            &&
                      prev.end.valueOf()  === course.start.valueOf()  &&
                      prev.name           === course.name             &&
                      CourseLocation.isSameLocation(prev.locations, course.locations)
        
      if (merge) {
          prev.duration += course.duration
        } else {
          day.courses.push(course)
        }
      }

      group.schedule.push(day)
    }
  }

  private async loadGroup(groupData: any, groups: Group[]) {
    for (const child of groupData.Groups || []) {
      this.loadGroup(child, groups)
    }

    if (groupData.Type != 1)
      return

    const group  = <Group>{ id: groupData.Id, name: groupData.Name, schedule: [] }
    const weekId = Chronos.getWeekId(new Date())

    for (let i = -4; i <= 4; i++) {
      await this.loadWeek(group.id, weekId + i, group)
    }

    groups.push(group)
  }

  async load(waitTime = 10_000) {
    this.loading++

    console.log('Refreshing data...')

    let groups = []

    if (this.savedGroups.length == 0)
      groups = this.savedGroups

    try {
      for (const group of await this.chronos.getGroups()) {
        await this.loadGroup(group, groups)
      }
    } catch {
      console.log('Unable to fetch data, waiting', waitTime, 'ms.')

      setTimeout(async () => await this.load(waitTime * 5), waitTime)
      this.loading--
      return
    }

    this.savedGroups = groups

    console.log('Done refreshing data.')
    this.loading--
  }
}

@Resolver(Group)
export class ChronosResolver {
  constructor(
    private readonly db: Database
  ) {}

  @Query(returns => [Group])
  groups(
    @Arg("name", type => [String], { nullable: true }) name: string[] | undefined
  ): Group[] {
    if (name == undefined) {
      return this.db.savedGroups
    } else {
      return this.db.savedGroups.filter(x => name.includes(x.name))
    }
  }

  @Query(returns => [Course])
  classes(
    @Arg("name", { description: 'Group name'}) name: string,
    @Arg("from", { nullable: true })           from: Date | undefined,
    @Arg("to"  , { nullable: true })           to  : Date | undefined
  ) : Course[] {
    const group = this.db.savedGroups.find(x => x.name == name)

    if (!group) return []

    const allClasses = []

    for (const day of this.schedule(group, from, to)) {
      allClasses.push(...day.courses)
    }

    return allClasses
  }

  @FieldResolver(of => [ScheduleDay])
  schedule(
    @Root()                          group: Group,
    @Arg("from", { nullable: true }) from : Date | undefined,
    @Arg("to"  , { nullable: true }) to   : Date | undefined
  ): ScheduleDay[] {
    if (!from) {
      from = new Date()
      from = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    }
    if (!to) {
      to = new Date(from.valueOf() + 3_600_000 * 24 * 2)
    }
    
    return group.schedule.filter(x => x.dayStart >= from && x.dayEnd <= to)
  }
}
