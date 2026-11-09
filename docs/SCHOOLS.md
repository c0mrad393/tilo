# Tilo for schools

A space where a teacher runs a class, pupils aged 6 to 15 draw in it, and their work stays
inside the class until the teacher shows it. Pupils have no email, no handle and no public
profile; they can't write to anyone and nobody outside the class can reach them. The teacher
sees not only the finished picture but how it was drawn, because every piece is a recording.

Open to any school for now. A school row carries a `plan`, so limits or a paid tier can come
later without moving data.

## Who is who

| | how they get in | what they can do |
|---|---|---|
| Tilo admin | their Tilo account | approves new schools, closes a school |
| Teacher | their own Tilo account (email) | registers a school or asks to join one; runs classes |
| Pupil | class code, their name from a list, a picture password | draws, hands work in, sees their class gallery |

**Teachers confirm teachers.** The first teacher registers the school and Tilo's admin
approves it. Every other teacher asks to join with the school's teacher code, and any active
teacher of that school approves or turns them down. Nobody runs a class in a school no
teacher there vouched for.

**Pupils.** A teacher types the class's names (a first name and an initial is enough, "Nino
B."). Each pupil gets a picture password: 3 pictures out of 12 for ages 6 to 8, 4 for older
pupils. The teacher prints sign-in cards with the sign-in address, the class code
and each pupil's pictures. Five wrong tries lock that pupil for 15 minutes; the teacher can
give new pictures at any time. Pupil sessions last 8 hours and are kept for the browser tab
only, since school computers are shared.

## A pupil's day

1. Opens tiloart.com/class, types the class code from the card, taps their name, taps
   their pictures.
2. Sees their tasks, their own drawings, and the class gallery.
3. Opens a task: the studio in pupil mode. Big tools, a crayon box of colours, undo, replay.
   Ages 6 to 11 get the simple set (pencil, marker, paint, spray, fill, eraser, or the pixel
   tools); 12 to 15 get the whole studio with layers.
4. Work saves to the server as they draw, so tomorrow on another computer it is still there.
5. Hands it in. They see the teacher's stamps and note when it comes back.

## The teacher's side

- **Classes**: name, age band, class code. Archive at the end of the year.
- **Tasks**: a title, a short brief, drawing or pixel art (and which grid), an optional fixed
  set of colours and a due date. Ready-made lessons fill this in.
- **Work**: per task, who handed in and who hasn't; each piece opens with its replay, the
  drawing time and stroke count. The teacher stamps it (Bold colours, Careful, Brave idea,
  Good use of space, Worked hard, Try again), writes a note, and either sends it back to work
  on or marks it reviewed. Reviewed work can be shown in the class gallery.
- **Pupils**: add, rename, new pictures, remove (their work goes with them), print cards.
- **Shows**: a teacher picks reviewed work for an exhibition with a title. A show is seen
  inside the school, or by anyone with its link (for parents; not listed or indexed). Names
  can be shown as written or left off.

## Safety

- Pupils can't write to each other or to anyone. Their only free text is a drawing's title.
- A pupil sees classmates' work only after the teacher reviewed it and chose to show it.
- Every handed-in piece goes through the same image check as the gallery (frames along the
  replay, layers alone, pixel art softened). A flagged piece can't go into a gallery or a
  show; the teacher sees why.
- Nothing about a pupil is public. A show by link shows the drawings and, if the teacher
  chooses, the names as typed.
- The school is the controller of its pupils' data and Tilo the processor. Tilo keeps only
  the names as typed, the pictures password and the drawings. No ads, no tracking.

## Demo

/demo is the whole thing running in the browser with a made-up school, three classes,
pupils, tasks, drawings in a child's hand (made in code, so they replay), reviews and a
show. Everything works, as teacher and as pupil, and nothing leaves the browser. It's for
showing schools what Tilo is before they sign up.

## Server

Built in 0.11 (migration 0013, `server/api/src/school.ts`, checked by `npm run server:smoke`).

- Tables `schools`, `teachers`, `classes`, `pupils`, `tasks`, `works`, `shows`. Only tilo-api
  reads and writes them; PostgREST and the API roles get none of it.
- **Teachers** use `/api/school` with their member token and need a handle. They see a school's
  code and colleagues only once approved, and run classes only in a school Tilo has let in
  (admin panel, Schools tab; every decision goes in the log).
- **Codes.** A class code is a word and four digits (`FOX-4821`); a teacher code is `TEACH-`
  and six letters, and only asks to join. A show's address is its title and eight random
  characters, so it can't be guessed.
- **Pupils** sign in at `/api/school/signin` and get a token signed with a key derived from the
  JWT secret, which Auth, PostgREST and the member check all refuse. It lasts 8 hours and is
  checked against the pupil's row on every request: new pictures, removing the pupil,
  archiving the class or closing the school end it at once. Five wrong tries lock a pupil for
  15 minutes; one address gets 40 wrong codes or pictures in ten minutes, enough for a class
  behind one school address.
- **Drawings** are files under `files/school/`, which Caddy never serves. `/api/school/works/{id}/rec`
  gives one to the pupil who drew it, to a teacher of the class, and to classmates once it
  is reviewed, shown and through the check; a show's link gives only the drawings in it.
- **The image check** runs on hand-in, on the same worker thread as the gallery's, one
  drawing at a time, and picks up where it left off after a restart. A held drawing can't go
  into the class gallery or a show.

## Later

- Shows on a public Tilo page, after a Tilo admin approves them.
- A school admin role, plan limits, paid tier.
- Portfolios as PDF, a year's work as a ZIP.
- Competitions between schools.
