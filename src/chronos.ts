import fetch from 'node-fetch'

export default class Chronos {
  constructor() {

  }

  get(endpoint: string) {
    return fetch(`http://v2.webservices.chronos.epita.net/api/v2${endpoint}`, {
      headers: {
        'Accept': 'application/json',
        'Auth-Token': '0bffc5524976f8e833a6df954ca01b06'
      }
    })
  }

  async getGroups() {
    const data = await this.get('/Group/GetGroups')
    const json = await data.json()

    return json
  }

  async getCurrentWeek(groupId: number, entityTypeId: number = 1) {
    const data = await this.get(`/Week/GetCurrentWeek/${groupId}/${entityTypeId}`)
    const json = await data.json()

    return json
  }

  async getWeek(weekId: number, groupId: number, entityTypeId: number = 1) {
    const data = await this.get(`/Week/GetWeek/${weekId}/${groupId}/${entityTypeId}`)
    const json = await data.json()

    return json
  }

  static getWeekId(date: Date) {
    const origin   = Date.UTC(2014, 7, 24)
    const timespan = date.getTime() - origin

    const divider = 7 * 24 * 3600 * 1000

    return Math.floor(timespan / divider)
  }
}
