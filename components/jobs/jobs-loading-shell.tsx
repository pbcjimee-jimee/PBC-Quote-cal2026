const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function JobsLoadingShell() {
  return (
    <section className="pbc-jobcalendar-loading" role="status" aria-label="Loading job calendar">
      <div className="pbc-jobcalendar-loading__toolbar" aria-hidden="true">
        <span className="pbc-loadingbar pbc-jobcalendar-loading__refresh" />
        <div className="pbc-jobcalendar-loading__monthnav">
          <span className="pbc-loadingbox" />
          <span className="pbc-loadingbar pbc-jobcalendar-loading__month" />
          <span className="pbc-loadingbox" />
        </div>
      </div>
      <div className="pbc-jobcalendar-loading__viewport" aria-hidden="true">
        <div className="pbc-jobcalendar-loading__grid">
          {weekdays.map((weekday) => (
            <span className="pbc-jobcalendar-loading__weekday" key={weekday}>{weekday}</span>
          ))}
          {Array.from({ length: 42 }, (_, index) => (
            <span className="pbc-jobcalendar-loading__day" key={index}>
              <span className="pbc-loadingbar pbc-jobcalendar-loading__date" />
              {index % 4 === 0 ? <span className="pbc-loadingbar pbc-jobcalendar-loading__job" /> : null}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
